import B2 from "./b2";
import Bucket from "./bucket";
import BackblazeServerError, { BackblazeLibraryError } from "./errors";
import fetch from "node-fetch";
import { FileInformation, FileUploadOptions } from "./file";
import AppendHashStream from "./append-hash-stream";

interface SinglePartUploadUrlInfo {
  bucketId: string;
  uploadUrl: string;
  authorizationToken: string;
}

export default class SinglePartUpload {
  private bucket: Bucket;

  private info: SinglePartUploadUrlInfo;

  private _inUse: boolean = false;
  get inUse() {
    return this._inUse;
  }

  private constructor(bucket: Bucket, info: SinglePartUploadUrlInfo) {
    this.bucket = bucket;
    this.info = info;
  }

  static async requestNew(bucket: Bucket): Promise<SinglePartUpload> {
    const res = await bucket.b2.callApi("b2_get_upload_url", {
      method: "POST",
      body: JSON.stringify({
        bucketId: await bucket.getBucketId(),
      }),
    });

    const info = await res.json();

    return new SinglePartUpload(bucket, info);
  }

  private async _upload(
    fileName: string,
    data: NodeJS.ReadableStream | Buffer,
    options: FileUploadOptions & { contentLength: number },
    retries: number
  ): Promise<FileInformation | false> {
    let {
      infoHeaders = {},
      contentType = "application/octet-stream",
      sha1,
      contentLength,
      maxRetries = 5,
      backoff = 150,
    } = options;

    if (typeof sha1 === "undefined") {
      const stream = new AppendHashStream("sha1");

      if (data instanceof Buffer) {
        stream.end(data);
      } else {
        data.pipe(stream);
      }

      sha1 = "hex_digits_at_end"; // Let B2 know we'll be deferring the hash.
      data = stream;
      contentLength += 40; // Length of the hash
    }

    const res = await fetch(this.info.uploadUrl, {
      method: "POST",
      headers: {
        ...(infoHeaders as Record<string, string>),
        Authorization: this.info.authorizationToken,
        "X-Bz-File-Name": B2.uriEncodeString(fileName),
        "Content-Type": contentType,
        "Content-Length": contentLength.toString(),
        "X-Bz-Content-Sha1": sha1,
      },
      body: data,
    });

    const resData = await res.json();

    switch (res.status) {
      case 200:
        return resData;
      case 400:
        throw new BackblazeServerError.BadRequest(resData);
      case 401:
        if (
          resData.code === "bad_auth_token" ||
          resData.code === "expired_auth_token"
        ) {
          return false;
        } else {
          throw new BackblazeServerError.UnauthorizedRequest(resData);
        }
      case 403:
        throw new BackblazeServerError.UsageCapExceeded(resData);
      case 408 /** timeout */:
        if (retries >= maxRetries)
          throw new BackblazeServerError.RequestTimeout(resData);
      case 429 /** rate-limit */:
        if (retries >= maxRetries)
          throw new BackblazeServerError.TooManyRequests(resData);

        const timeout = backoff * Math.pow(2, retries) * (0.5 + Math.random());

        return new Promise((res, rej) => {
          setTimeout(() => {
            this._upload(
              fileName,
              data,
              { ...options, contentLength },
              retries + 1
            ).then(res, rej);
          }, timeout);
        });
      case 405:
        throw new BackblazeLibraryError.Internal(
          "Sent a request with the wrong HTTP method. B2 gave message: " +
            resData.message
        );
      default:
        throw new BackblazeServerError.UnknownServerError(resData);
    }
  }

  /**
   * @private
   * @returns `false` when this single part upload is no longer valid.
   */
  upload(
    name: string,
    stream: NodeJS.ReadableStream | Buffer,
    opts: FileUploadOptions & { contentLength: number }
  ): Promise<FileInformation | false>;
  /**
   * @private
   * @returns `false` when this single part upload is no longer valid.
   */
  upload(
    fileName: string,
    buffer: Buffer,
    options: FileUploadOptions
  ): Promise<FileInformation | false>;
  async upload(
    fileName: string,
    data: NodeJS.ReadableStream | Buffer,
    options: FileUploadOptions
  ): Promise<FileInformation | false> {
    if (this.inUse)
      throw new BackblazeLibraryError.BadUsage(
        "Tried to use a Single Part Upload which is in use."
      );

    let result: FileInformation | false | undefined;

    try {
      this._inUse = true;

      let { contentLength } = options;

      if (typeof contentLength === "undefined") {
        if (!(data instanceof Buffer))
          throw new BackblazeLibraryError.BadUsage(
            "Single part uploads must have a known contentLength."
          );
        contentLength = data.length;
      }

      result = await this._upload(
        fileName,
        data,
        { ...options, contentLength },
        0
      );
      return result;
    } finally {
      if (result !== false) this._inUse = false;
    }
  }
}
