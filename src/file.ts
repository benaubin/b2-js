import Bucket from "./bucket";
import FileUploadStream from "./file-upload-stream";
import BackblazeServerError, { BackblazeLibraryError } from "./errors";
import { PassThrough } from 'stream';

/**
 * Where sensible, Backblaze recommends these values to allow different B2 clients
 * and the B2 web user interface to interoperate correctly
 *
 * The file name and file info must fit, along with the other necessary headers,
 * within a 7,000 byte limit. This limit applies to the fully encoded HTTP header line,
 * including the carriage-return and newline.
 *
 * See [Files] for further details about HTTP header size limit.
 *
 * [Files]: https://www.backblaze.com/b2/docs/files.htmlx
 */
export interface FileInfo {
  /**
   * The value should be a base 10 number which represents a UTC time when the
   * original source file was last modified. It is a base 10 number of milliseconds
   * since midnight, January 1, 1970 UTC. This fits in a 64 bit integer.
   */
  src_last_modified_millis: string;

  /**
   * If this is present, B2 will use it as the value of the 'Content-Disposition' header
   * when the file is downloaded (unless it's overridden by a value given in the download request).
   * The value must match the grammar specified in RFC 6266.
   * Parameter continuations are not supported.
   *
   * 'Extended-value's are supported for charset 'UTF-8' (case-insensitive) when the language is empty.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-disposition header.
   * Instead, it (or the value specified in a request) will be in the Content-Disposition.
   */
  "content-disposition"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Content-Language' header when the file
   *  is downloaded (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-language header.
   *
   * Instead, it (or the value specified in a request) will be in the Content-Language header.
   */
  "content-language"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Expires' header when the file is downloaded
   * (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-expires header.
   * Instead, it (or the value specified in a request) will be in the Expires header.
   */
  "b2-expires"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Cache-Control' header when the file is
   * downloaded (unless it's overridden by a value given in the download request), and overriding
   * the value defined at the bucket level.
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-cache-control header.
   * Instead, it (or the value specified in a request) will be in the Cache-Control header.
   */
  "b2-cache-control"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Content-Encoding' header when the file
   * is downloaded (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-encoding header.
   * Instead, it (or the value specified in a request) will be in the Content-Encoding header.
   */
  "b2-content-encoding"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Content-Type' header when the file is downloaded
   * (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-type header.
   * Instead, it (or the value specified in a request) will be in the Content-Type header.
   */
  "b2-content-type"?: string;

  /**
   * ## Custom headers:
   *
   * - Must use the format `X-Bz-Info-*` for the header name.
   * - Up to 10 of these headers may be present.
   * - The * part of the header name is replaced with the name of a custom field in the file
   *   information stored with the file, and the value is an arbitrary UTF-8 string, percent-encoded.
   * - The same info headers sent with the upload will be returned with the download.
   * - The header name is case insensitive.
   */
  [key: string]: string | undefined;
}

export enum FileAction {
  /** "start" means that a large file has been started, but not finished or canceled */
  start = "start",
  /** "upload" means a file that was uploaded to B2 Cloud Storage.  */
  upload = "upload",
  /** "hide" means a file version marking the file as hidden, so that it will not show up in `b2_list_file_names`. */
  hide = "hide",
  /** "folder" is used to indicate a virtual folder when listing files. */
  folder = "folder",
}

export interface FileData {
  /** The account that owns the file. */
  accountId: string;

  action: FileAction;

  /** The bucket that the file is in. */
  bucketId: string;

  /** The number of bytes stored in the file. Only useful when the action is "upload". Always 0 when the action is "start", "hide", or "folder". */
  contentLength: number;

  /**
   * The SHA1 of the bytes stored in the file as a 40-digit hex string.
   *
   * Large files do not have SHA1 checksums, and the value is "none".
   *
   * The value is null when the action is "hide" or "folder".
   */
  contentSha1: string | null;

  /**
   * When the action is "upload" or "start", the MIME type of the file,
   * as specified when the file was uploaded.
   *
   * For "hide" action, always "application/x-bz-hide-marker".
   *
   * For "folder" action, always null.
   */
  contentType: string | null;

  /**
   * The unique identifier for this version of this file.
   *
   * Used with b2_get_file_info, b2_download_file_by_id, and b2_delete_file_version.
   *
   * The value is null when for action "folder".
   */
  fileId: string | null;

  /**
   * The custom information that was uploaded with the file.
   *
   * This is a JSON object, holding the name/value pairs that were uploaded with the file.
   */
  fileInfo: Record<string, any>;

  /** The name of this file, which can be used with `b2_download_file_by_name`. */
  fileName: string;

  /** This is a UTC time when this file was uploaded.
   *
   * It is a base 10 number of milliseconds since midnight, January 1, 1970 UTC.
   * This fits in a 64 bit integer.
   *
   * Always 0 when the action is "folder".
   */
  uploadTimestamp: string;
}

export interface FileUploadOptions {
  /**
   * The length of the file in bytes.
   *
   * Automatically calculated for `Buffer`s.
   *
   * Required in order to enable single-part uploads for streams.
   */
  contentLength?: number;

  /** We will calculate this if not passed */
  sha1?: string;

  contentType?: string;
  fileInfo?: FileInfo;

  maxRetries?: number;
  backoff?: number;
}

type MinimumFileData = Partial<FileData> & { fileName: string };

export default class File {
  private _bucket: Bucket;
  private _fileData: MinimumFileData;

  constructor(bucket: Bucket, fileData: MinimumFileData) {
    this._bucket = bucket;
    this._fileData = fileData;
  }

  async getFileName() {
    let { fileName } = this._fileData;
    if (typeof fileName !== "undefined") return fileName;

    return (await this.stat()).fileName;
  }

  /**
   * When getting a file's ids by its `fileName`, this is a Class C transaction
   * See https://www.backblaze.com/b2/cloud-storage-pricing.html
   */
  async getFileId() {
    let { fileId } = this._fileData;
    if (typeof fileId !== "undefined" && fileId !== null) return fileId;

    return (await this.stat()).fileId;
  }

  getBucketId() {
    return this._bucket.getBucketId();
  }

  getBucketName() {
    return this._bucket.getBucketName();
  }

  get b2() {
    return this._bucket.b2;
  }

  /**
   * Gets file data by fileId or fileName.
   * 
   * When stating a file without its `fileId`, this is a Class C transaction
   * See https://www.backblaze.com/b2/cloud-storage-pricing.html
   * 
   * @throws {@linkcode BackblazeLibraryError.FileNotFound} When a file is not found by name.
   */
  async stat(): Promise<FileData> {
    const { fileId, fileName } = this._fileData;

    if (typeof fileId !== "undefined" && fileId != null) {
      const res = await this.b2.callApi("b2_get_file_info", {
        method: "POST",
        body: JSON.stringify({
          fileId: await this.getFileId()
        })
      });

      return this._fileData = await res.json();
    } else if (typeof fileName !== "undefined") {
      const {files: [fileData]} = await this._bucket._getFileDataBatch({ batchSize: 1, startFileName: fileName });
      if(typeof fileData === "undefined" || fileData.fileName !== fileName) 
        throw new BackblazeLibraryError.FileNotFound("The file was not found.");
      
      return this._fileData = fileData;
    } else {
      throw new BackblazeLibraryError.BadUsage("To stat a file, you must provide either its fileId or fileName.")
    }
  }

  /**
   * Download this file from B2.
   * 
   * ```js
   * const file = bucket.file("text.txt");
   * file.createReadStream();
    ```
   */
  createReadStream(): NodeJS.ReadableStream {
    const stream = new PassThrough();

    const { fileId, fileName } = this._fileData;

    if (typeof fileId !== "undefined" && fileId != null) {
      this.b2.callDownloadApi(
        "b2_download_file_by_id?fileId=" + encodeURIComponent(fileId),
        {}
      ).then((res) => {
        res.body.on("error", stream.destroy)
        res.body.pipe(stream);
      });
    } else if (typeof fileName !== "undefined") {
      Promise.all([this.getBucketName()]).then(([bucketName]) =>
        this.b2.requestFromDownloadFileByName(
          bucketName,
          fileName,
          {}
        )
      ).then((res) => {
        res.body.on("error", stream.destroy)
        res.body.pipe(stream);
      });
    } else {
      throw new BackblazeLibraryError.BadUsage("To download a file, you must provide either its fileId or fileName.")
    }

    return stream;
  }

  /**
   * Upload to this file on B2.
   * 
   * This works by loading chunks of the stream, upto {@linkcode B2.partSize},
   * into memory. If the stream has less than or equal to that many bytes, a 
   * single-part upload will be attempted.
   * 
   * Otherwise, a multi-part upload will be attempted by loading up-to 
   * `b2.partSize` bytes of the stream into memory at a time.
   * 
   * ```js
   * const file = bucket.file("example");
   * const stream = file.createWriteStream();
   * stream.on("error", (err) => {
   *   // handle the error 
   *   // note that retries are automatically attempted before errors are 
   *   // thrown for most potentially recoverable errors, as per the B2 docs.
   * })
   * stream.on("finish", (err) => {
   *   // upload done, the file instance has been updated to reflect this
   * })
   * res.body.pipe(stream);
   * ```
   */
  createWriteStream(): FileUploadStream {
    return new FileUploadStream(this);
  }

  /** @protected */
  async _startMultipartUpload(options: FileUploadOptions): Promise<void> {
    if (this._fileData.action === FileAction.upload) return;

    const [bucketId, fileName] = await Promise.all([
      this.getBucketId(),
      this.getFileName(),
    ]);

    const res = await this.b2.callApi("b2_start_large_file", {
      method: "POST",
      body: JSON.stringify({
        bucketId,
        fileName,
        contentType: options.contentType || "application/octet-stream",
        fileInfo: options.fileInfo,
      }),
    });

    this._fileData = await res.json();
  }

  /** @protected */
  async uploadSinglePart(
    data: Buffer | NodeJS.ReadableStream,
    options: FileUploadOptions & { contentLength: number }
  ) {
    return this._bucket.uploadSinglePart(
      await this.getFileName(),
      data,
      options
    );
  }
}
