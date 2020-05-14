import { createHash, Hash } from "crypto";
import { Writable } from "stream";
import uploadPart, { MultipartUploadUrl } from "./api-operations/upload-part";
import B2 from "./b2";
import File, { FileData, FileUploadOptions } from "./file";
import { Buffer } from "buffer";
import { BackblazeLibraryError } from "./errors";

class PendingPart extends Writable {
  private readonly chunks: Buffer[] = [];
  private readonly hash: Hash = createHash("sha1");

  bytes: number = 0;

  _write(chunk: Buffer, _: any, callback: (err?: Error) => void) {
    this.hash.update(chunk);
    this.bytes += chunk.byteLength;
    this.chunks.push(chunk);

    callback()
  }

  digest!: string;

  concat(): Buffer {
    return Buffer.concat(this.chunks);
  }

  _final(cb: (err?: Error) => void) {
    this.digest = this.hash.digest("hex");

    cb();
  }
}

export default class FileUploadStream extends Writable {
  get partSize(): number {
    return this.b2["auth"].absoluteMinimumPartSize;
    return this.b2["auth"].recommendedPartSize;
  }

  readonly file: File;
  readonly b2: B2;

  pendingPart: PendingPart;

  private _isMultipart: boolean = false;

  readonly options: FileUploadOptions;

  constructor(file: File, options: FileUploadOptions = {}) {
    super({});

    this.file = file;
    this.options = options;

    this.b2 = file.b2;

    this.pendingPart = new PendingPart();
  }

  __process(chunk: Buffer, callback: (error?: Error | null) => void) {
    const spaceInPart = this.partSize - this.pendingPart.bytes;

    if (chunk.byteLength > spaceInPart) {
      const part = this.pendingPart;
      this.pendingPart = new PendingPart();

      part.write(chunk.slice(0, spaceInPart));
      
      part.on("error", callback);
      part.end(() => {
        this.uploadPart(part).then(
          () => {
            this.__process(chunk.slice(spaceInPart), callback);
          },
          (err) => {
            callback(err);
          }
        );
      });
    } else {
      this.pendingPart.write(chunk, callback);
    }
  }

  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    this.__process(chunk, callback)
  }

  _final(cb: (error?: Error | null) => void) {
    this._finishUpload().then(
      () => cb(),
      (err) => cb(err)
    );
  }

  private readonly _uploadDigestPromises: Promise<string>[] = [];

  private readonly uploadUrls: MultipartUploadUrl[] = [];


  private uploadPart(part: PendingPart) {
    const uploadUrl = this.uploadUrls.pop();
    const partNumber = this._uploadDigestPromises.length + 1;

    const promise = ((this._isMultipart)
      ? Promise.resolve()
      : this.file._startMultipartUpload(this.options)
    ).then(() =>
      uploadPart(
        partNumber,
        part.concat(),
        part.digest,
        uploadUrl,
        () => this._getMultipartUploadUrl(),
        this.options.maxRetries || 5,
        this.options.backoff || 150
      )
    );

    this._isMultipart = true;

    this._uploadDigestPromises.push(
      promise.then((data) => data.data.contentSha1)
    );

    promise.then(({ url }) => {
      this.uploadUrls.push(url);
    });

    return promise;
  }

  private async _uploadAsSinglePart(): Promise<FileData> {
    if (this._isMultipart)
      throw new BackblazeLibraryError.BadUsage(
        "Cannot upload as single part after beginning a multipart upload."
      );

    return this.file.uploadSinglePart(this.pendingPart.concat(), {
      ...this.options,
      contentLength: this.pendingPart.bytes,
      sha1: this.pendingPart.digest
    });
  }

  private async _finishUpload(): Promise<void> {
    this.file["_fileData"] = await (this._uploadDigestPromises.length === 0
      ? this._uploadAsSinglePart()
      : this._finishMultipart());
  }

  private async _finishMultipart(): Promise<FileData> {
    await new Promise<void>((res, rej) => {
      this.pendingPart.on("error", rej);
      this.pendingPart.end(res);
    })
    await this.uploadPart(this.pendingPart);

    const res = await this.file.b2.callApi("b2_finish_large_file", {
      method: "POST",
      body: JSON.stringify({
        fileId: await this.file.getFileId(),
        partSha1Array: await Promise.all(this._uploadDigestPromises),
      }),
    });

    return await res.json();
  }

  /** @private */
  private async _getMultipartUploadUrl(): Promise<MultipartUploadUrl> {
    const res = await this.file.b2.callApi("b2_get_upload_part_url", {
      method: "POST",
      body: JSON.stringify({ fileId: await this.file.getFileId() }),
    });

    return await res.json();
  }
}
