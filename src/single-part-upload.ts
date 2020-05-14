import B2 from "./b2";
import Bucket, { FileUploadOptions } from "./bucket";
import BackblazeServerError, { BackblazeLibraryError } from "./errors";
import fetch from "node-fetch";
import { FileInformation } from "./file";

interface SinglePartUploadUrlInfo {
  bucketId: string;
  uploadUrl: string;
  authorizationToken: string;
}

export default class SinglePartUpload {
  bucket: Bucket;
  get b2(): B2 {
    return this.bucket.b2;
  }

  private info: SinglePartUploadUrlInfo;

  private _inUse: boolean;
  get inUse() {
    return this._inUse;
  }

  private constructor(bucket: Bucket, info: SinglePartUploadUrlInfo) {
    this.bucket = bucket;
    this.info = info;
  }

  static async requestNew(bucket: Bucket): Promise<SinglePartUpload> {
    const res = await bucket.b2.callApi("b2_get_upload_url", {
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
      maxRetries,
      backoff = 150,
    } = options;

    const res = await fetch(this.info.uploadUrl, {
      method: "POST",
      headers: {
        ...infoHeaders,
        Authorization: this.info.authorizationToken,
        "X-Bz-File-Name": B2.uriEncodeString(fileName),
        "Content-Type": typeof contentType === "undefined" ? "" : contentType,
        "Content-Length":
          typeof sha1 === "undefined"
            ? (contentLength + 40).toString()
            : contentLength.toString(),
        "X-Bz-Content-Sha1":
          typeof sha1 === "undefined" ? "hex_digits_at_end" : sha1,
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
      // otherwise, fall-through
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
    }
  }

  /**
   *
   *
   * @param fileName The name of this file.
   * @param stream The data to upload
   * @param options Must include `{ contentLength: number }`
   * @returns `false` when this single part upload is no longer valid.
   */
  upload(
    name: string,
    stream: NodeJS.ReadableStream | Buffer,
    opts: FileUploadOptions & { contentLength: number }
  ): Promise<FileInformation | false>;
  /**
   *
   *
   * @param fileName The name of this file.
   * @param buffer The data to upload
   * @param options
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
