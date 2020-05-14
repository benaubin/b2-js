import Bucket from "./bucket";

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
  src_last_modified_millis: string

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
