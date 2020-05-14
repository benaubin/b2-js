import { BackblazeInfoHeaders } from "./backblaze-info-headers";

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

export interface FileInformation {
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
  infoHeaders?: BackblazeInfoHeaders;

  maxRetries?: number;
  backoff?: number;
}
