import B2 from "./b2";
import File, { FileUploadOptions, FileData } from "./file";
import SinglePartUpload from "./single-part-upload";
import { BackblazeLibraryError } from "./errors";

export enum BucketType {
  allPublic = "allPublic",
  allPrivate = "allPrivate",
  snapshot = "snapshot",
}

export type MinimumBucketInfo = Partial<BucketInfo> &
  (
    | {
        bucketId: string;
      }
    | {
        bucketName: string;
      }
  );

export interface BucketInfo {
  /** The account that the bucket is in. */
  accountId: string;

  /** The unique ID of the bucket. */
  bucketId: string;

  /** The unique name of the bucket */
  bucketName: string;

  bucketType: BucketType | Exclude<string, BucketType>;

  /** The user data stored with this bucket. */
  bucketInfo: any;

  /**
   * The CORS rules for this bucket. See [CORS Rules] for an overview and the rule structure.
   *
   * [CORS Rules]: https://www.backblaze.com/b2/docs/cors_rules.html
   */
  corsRules: any;

  /**
   * The list of lifecycle rules for this bucket. See [Lifecycle Rules] for an overview and the rule structure.
   *
   * [Lifecycle Rules]: https://www.backblaze.com/b2/docs/lifecycle_rules.html
   */
  lifecycleRules: any;

  /**
   * A counter that is updated every time the bucket is modified,
   * and can be used with the ifRevisionIs parameter to b2_update_bucket
   * to prevent colliding, simultaneous updates
   */
  revision: any;

  /** A set of strings reserved for future use. */
  options: any;
}

export interface ListFilesOptions {
  /**
   * The first file name to return. If there is a file with this name,
   * it will be returned in the list. If not, the first file name
   * after this the first one after this name.
   */
  startFileName?: string;

  /**
   * The maximum number of files to return from this call.
   *
   * The default value is 100, and the maximum is 10000.
   * To the API, Passing in 0 means to use the default of 100.
   *
   * NOTE: b2_list_file_names is a Class C transaction (see [Pricing]).
   *
   * [Pricing]: https://www.backblaze.com/b2/cloud-storage-pricing.html
   *
   * The maximum number of files returned per transaction is 1000.
   * If you set maxFileCount to more than 1000 and more than 1000 are
   * returned, the call will be billed as multiple transactions, as
   * if you had made requests in a loop asking for 1000 at a time.
   *
   * For example: if you set maxFileCount to 10000 and 3123 items are
   * returned, you will be billed for 4 Class C transactions.
   */
  batchSize?: number;

  /**
   * Files returned will be limited to those with the given prefix.
   * You can optionally specify a file name prefix, which will restrict the results to only files starting with that prefix.
   */
  prefix?: string;

  /**
   * You may specify a delimiter (usually "/") for folder names.
   * If found after the file name prefix, the delimiter is treated as the end of a folder name,
   * and the folder name is returned, replacing all of the files in that folder.
   *
   * Each item returned is either an "upload" (a file) or a "folder" (representing one or many files).
   *
   * Files returned will be limited to those within the top folder, or
   * any one subfolder. Defaults to NULL. Folder names will also be returned.
   *
   * The delimiter character will be used to "break" file names into folders.
   */
  delimiter?: string;
}

export default class Bucket {
  readonly b2: B2;

  info: MinimumBucketInfo;

  constructor(b2: B2, info: MinimumBucketInfo) {
    this.b2 = b2;
    this.info = info;
  }

  /** 
   * Lists files from B2.
   * 
   * @internal
   */
  async _getFileDataBatch({
    batchSize,
    startFileName,
    ...options
  }: ListFilesOptions): Promise<{
    files: FileData[];
    nextFileName: string | null;
  }> {
    const res = await this.b2.callApi("b2_list_file_names", {
      method: "POST",
      body: JSON.stringify({
        ...options,
        bucketId: await this.getBucketId(),
        maxFileCount: batchSize,
        startFileName,
      }),
    });
    return await res.json();
  }

  /** 
   * Lists file data from B2.
   * 
   * You probably should use {@linkcode files} instead to get {@linkcode File} objects.
   */
  async *listFileData({
    batchSize,
    startFileName,
    ...options
  }: ListFilesOptions): AsyncIterable<FileData> {
    while (true) {
      const { files, nextFileName } = await this._getFileDataBatch(options);

      yield* files;

      if (nextFileName === null) break;

      startFileName = nextFileName;
    }
  }

  /** 
   * Lists files from B2.
   */
  async *files(options: ListFilesOptions): AsyncIterable<File> {
    for await (const fileData of this.listFileData(options)) {
      yield new File(this, fileData);
    }
  }
  file(fileData: FileData): File;
  file(fileName: string): File;
  file(arg: string | FileData): File {
    return new File(this, typeof arg === "string" ? { fileName: arg } : arg);
  }

  async getBucketName(): Promise<string> {
    if (typeof this.info.bucketName !== "undefined")
      return this.info.bucketName;

    return (await this.refreshBucketInfo()).bucketName;
  }
  async getBucketId(): Promise<string> {
    if (typeof this.info.bucketId !== "undefined") return this.info.bucketId;

    return (await this.refreshBucketInfo()).bucketId;
  }

  /**
   * Reloads the `info` attribute from B2.
   */
  async refreshBucketInfo(): Promise<BucketInfo> {
    const query: any = {
      accountId: this.b2["auth"].accountId,
    };

    if (typeof this.info.bucketId !== "undefined") {
      query.bucketId = this.info.bucketId;
    } else {
      query.bucketName = this.info.bucketName;
    }

    const res = await this.b2.callApi("b2_list_buckets", {
      method: "POST",
      body: JSON.stringify(query),
    });

    const {
      buckets: [bucket],
    }: { buckets: [] | [BucketInfo] } = await res.json();

    if (bucket) {
      return (this.info = bucket);
    } else {
      throw new BackblazeLibraryError.BadUsage(
        "Bucket missing: " + this.info.bucketName || this.info.bucketInfo
      );
    }
  }

  private _singlePartUploads: SinglePartUpload[] = [];
  private async getSinglePartUpload(): Promise<SinglePartUpload> {
    let upload = this._singlePartUploads.pop();
    if (typeof upload !== "undefined") return upload;

    return SinglePartUpload.requestNew(this);
  }

  /**
   * Upload a file using a single-part upload. 
   * 
   * For larger files (recommended for 100MB, but no less than 5MB), see {@linkcode File.createWriteStream}.
   * 
   * @param fileName The name of the destination file.
   * @param data Buffer or stream.
   * @param options Must have a `contentLength` attribute
   */
  async uploadSinglePart(
    fileName: string,
    data: Buffer | NodeJS.ReadableStream,
    options: FileUploadOptions & { contentLength: number }
  ): Promise<FileData> {
    const singlePartUpload = await this.getSinglePartUpload();
    try {
      const fileData = await singlePartUpload.upload(fileName, data, options);

      return fileData === false
        ? this.uploadSinglePart(fileName, data, options)
        : fileData;
    } finally {
      if (!singlePartUpload.inUse)
        this._singlePartUploads.push(singlePartUpload);
    }
  }

  /**
   * Automatically upload Buffers.
   * 
   * The library automatically decides whether to conduct a single or multi-part
   * upload based on the Buffer's `byteLength`.
   * 
   * ```js
   * // a single-part upload will be attempted.
   * bucket.upload("test.txt", Buffer.from("foobar"));
   * 
   * // a multi-part upload will automatically be attempted for larger files
   * bucket.upload("test.txt", Buffer.from("*".repeat(101*1000*1000 /* 101MB *\/)));
   * ```
   * 
   * @param fileName The name of the destination file.
   * @param data The file contents.
   * @param options 
   */
  async upload(
    fileName: string,
    data: Buffer,
    options: FileUploadOptions = {}
  ): Promise<File> {
    const contentLength = data.byteLength;

    if (
      typeof contentLength !== "undefined" &&
      contentLength <= this.b2.partSize
    ) {
      const fileData = await this.uploadSinglePart(fileName, data, {
        ...options,
        contentLength,
      });
      return new File(this, fileData);
    } else {
      const file = new File(this, { fileName });
      const writeStream = file.createWriteStream();
      return new Promise((res, rej) => {
        writeStream.on("error", rej);
        writeStream.on("finish", () => {
          res(file);
        });
        writeStream.end(data);
      });
    }
  }
}
