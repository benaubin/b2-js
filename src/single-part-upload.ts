import B2 from "./b2";
import Bucket from "./bucket";
import BackblazeServerError, { BackblazeLibraryError } from "./errors";
import fetch from "node-fetch";
import { FileData, FileUploadOptions } from "./file";
import AppendHashStream from "./append-hash-stream";

interface SinglePartUploadUrlInfo {
  bucketId: string;
  uploadUrl: string;
  authorizationToken: string;
}

/** @internal */
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

  /** Create a new single part uploader by requesting a new upload url from B2. */
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

  /** @private */
  private async _upload(
    fileName: string,
    data: NodeJS.ReadableStream | Buffer,
    options: FileUploadOptions & { contentLength: number },
    retries: number
  ): Promise<FileData | false> {
    let {
      fileInfo,
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

    const headers: Record<string, string> = {
      Authorization: this.info.authorizationToken,
      "X-Bz-File-Name": B2.uriEncodeString(fileName),
      "Content-Type": contentType,
      "Content-Length": contentLength.toString(),
      "X-Bz-Content-Sha1": sha1,
      "User-Agent": B2.userAgent,
    }

    if(typeof fileInfo !== "undefined") {
      for (const key in fileInfo) {
        if (fileInfo.hasOwnProperty(key)) {
          const val = fileInfo[key];
          if(typeof val !== "undefined") headers["X-Bz-Info-" + key] = val;
        }
      }
    }

    const res = await fetch(this.info.uploadUrl, {
      method: "POST",
      headers,
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
   * @returns `false` when this single part upload is no longer valid.
   */
  upload(
    name: string,
    stream: NodeJS.ReadableStream | Buffer,
    opts: FileUploadOptions & { contentLength: number }
  ): Promise<FileData | false>;

  /**
   * @returns `false` when this single part upload is no longer valid.
   */
  upload(
    fileName: string,
    buffer: Buffer,
    options: FileUploadOptions
  ): Promise<FileData | false>;
  async upload(
    fileName: string,
    data: NodeJS.ReadableStream | Buffer,
    options: FileUploadOptions
  ): Promise<FileData | false> {
    if (this.inUse)
      throw new BackblazeLibraryError.BadUsage(
        "Tried to use a Single Part Upload which is in use."
      );

    let result: FileData | false | undefined;

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
