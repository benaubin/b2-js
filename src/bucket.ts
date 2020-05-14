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

export default class Bucket {
  readonly b2: B2;

  info: MinimumBucketInfo;

  constructor(b2: B2, info: MinimumBucketInfo) {
    this.b2 = b2;
    this.info = info;
  }

  file(fileName: string): File {
    return new File(this, {fileName});
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
