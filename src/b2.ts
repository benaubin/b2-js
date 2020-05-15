import fetch, { RequestInit, Response } from "node-fetch";
import {
  authorize,
  B2Credentials,
  AuthorizeAccountSuccessResponse,
} from "./api-operations/authorize-account";
import BackblazeServerError, { BackblazeErrorResponse } from "./errors";
import Bucket, { MinimumBucketInfo } from "./bucket";

const { version } = require("../package.json") as { version: string };

interface RequestOptions {
  maxRetries?: number;
  backoff?: number;
}

export default class B2 {
  private credentials: B2Credentials;

  private auth!: AuthorizeAccountSuccessResponse;

  private _userSetPartSize?: number;

  /**
   * Backblaze allows uploading files as a single-part or as multiple parts.
   * However, you must know the length of each file in advance, and you cannot
   * use chunked-encoding. Single-part uploads are generally faster for smaller files.
   * Backblaze recommends a part-size, which is automatically used.
   *
   * Each part must be read into memory.
   *
   * You can configure this, to a minimum of `b2.auth.absoluteMinimumPartSize`.
   */
  get partSize() {
    return typeof this._userSetPartSize !== "undefined"
      ? Math.max(this._userSetPartSize, this.auth.absoluteMinimumPartSize)
      : this.auth.recommendedPartSize;
  }
  set partSize(size: number) {
    this._userSetPartSize = size;
  }

  static readonly apiVersion: string = "v2";
  static readonly userAgent: string = `b2-js/${version}+nodejs/${process.version} https://git.io/b2-js`;

  private constructor(credentials: B2Credentials) {
    this.credentials = credentials;
  }

  private async authorize() {
    this.auth = await authorize(this.credentials);
  }

  /**
   * Create a new B2 client by authorizing with the API.
   *
   * ```js
   * import B2 from "./src/b2";
   *
   * const b2 = await B2.authorize({
   *   applicationKeyId: "KEY_ID",
   *   applicationKey: "SECRET_KEY"
   * });
   * ```
   */
  static async authorize(credentials: B2Credentials): Promise<B2> {
    const b2 = new B2(credentials);
    await b2.authorize();
    return b2;
  }

  /** @internal */
  static uriEncodeString(decoded: string) {
    return encodeURIComponent(decoded).replace(/%2F/g, "/");
  }

  /** @internal */
  static uriDecodeString(encoded: string) {
    return decodeURIComponent(encoded).replace(/\+/g, " ");
  }

  private async request(
    url: string,
    request: RequestInit,
    _options: RequestOptions,
    retries: number = 0
  ): Promise<Response> {
    const options = { maxRetries: 5, backoff: 150, ..._options };
    const { maxRetries, backoff } = options;

    let res: Response;
    try {
      res = await fetch(url, {
        ...request,
        headers: {
          ...request.headers,
          Authorization: this.auth.authorizationToken,
          "User-Agent": B2.userAgent,
        },
      });
    } catch {
      return new Promise((res, rej) => {
        setTimeout(() => {
          this.request(
            url,
            request,
            { ...options, backoff: backoff * 2 },
            retries + 1
          ).then(res, rej);
        }, backoff * (0.5 + Math.random()));
      });
    }

    if (res.status === 200) {
      return res;
    } else {
      const data = (await res.json()) as BackblazeErrorResponse;
      switch (data.code) {
        case "bad_request":
          throw new BackblazeServerError.BadRequest(data);
        case "unauthorized":
          throw new BackblazeServerError.UnauthorizedRequest(data);
        case "download_cap_exceeded":
          throw new BackblazeServerError.DownloadCapExceeded(data);
        case "bad_auth_token":
        case "expired_auth_token":
          if (retries < maxRetries) {
            await this.authorize();
            return this.request(url, request, options, retries + 1);
          } else {
            throw new BackblazeServerError.ExpiredCredentials(data);
          }
        default:
          switch (data.status) {
            case 400:
              throw new BackblazeServerError.BadRequest(data);
            case 403:
              throw new BackblazeServerError.Forbidden(data);
            case 416:
              throw new BackblazeServerError.RangeNotSatisfiable(data);
            case 500:
              throw new BackblazeServerError.InternalServerError(data);
            case 408:
              if (retries >= maxRetries)
                throw new BackblazeServerError.RequestTimeout(data);
            case 500:
              if (retries >= maxRetries)
                throw new BackblazeServerError.InternalServerError(data);
            case 503:
              if (retries >= maxRetries)
                throw new BackblazeServerError.ServiceUnavailable(data);

              return new Promise((res, rej) => {
                setTimeout(() => {
                  this.request(
                    url,
                    request,
                    { ...options, backoff: backoff * 2 },
                    retries + 1
                  ).then(res, rej);
                }, backoff * (0.5 + Math.random()));
              });
            default:
              throw new BackblazeServerError.UnknownServerError(data);
          }
      }
    }
  }

  /** Call a b2 operation by name */
  async callApi(
    operationName: string,
    request: RequestInit,
    opts: RequestOptions = {}
  ) {
    const url = [this.auth.apiUrl, "b2api", B2.apiVersion, operationName].join(
      "/"
    );
    return this.request(url, request, opts);
  }

  /** @internal */
  async callDownloadApi(
    operationName: string,
    request: RequestInit,
    opts: RequestOptions = {}
  ) {
    const url = [
      this.auth.downloadUrl,
      "b2api",
      B2.apiVersion,
      operationName,
    ].join("/");
    return this.request(url, request, opts);
  }

  /** @internal */
  async requestFromDownloadFileByName(
    bucketName: string,
    fileName: string,
    request: RequestInit,
    opts: RequestOptions = {}
  ) {
    const url = [this.auth.downloadUrl, "file", bucketName, fileName].join("/");
    return this.request(url, request, opts);
  }

  /**
   * Get a bucket by name.
   *
   * ```js
   * const bucket = await b2.bucket("js-testing-bucket");
   * ```
   */
  bucket(name: string): Promise<Bucket>;

  /**
   * Get a bucket by id.
   *
   * ```js
   * const bucket = await b2.bucket({bucketId: "BUCKET_ID"});
   * ```
   */
  bucket(info: MinimumBucketInfo): Promise<Bucket>;

  async bucket(info: string | MinimumBucketInfo): Promise<Bucket> {
    return new Bucket(
      this,
      typeof info === "string" ? { bucketName: info } : info
    );
  }
}
