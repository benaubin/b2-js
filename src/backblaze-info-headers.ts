/**
 * Where sensible, Backblaze recommends these headers to allow different B2 clients
 * and the B2 web user interface to interoperate correctly
 *
 * The file name and file info must fit, along with the other necessary headers,
 * within a 7,000 byte limit. This limit applies to the fully encoded HTTP header line,
 * including the carriage-return and newline.
 *
 * See [Files] for further details about HTTP header size limit.
 *
 * [Files]: https://www.backblaze.com/b2/docs/files.htmlx
 * 
 * ## Custom headers:
 * 
 * - Must use the format `X-Bz-Info-*` for the header name.
 * - Up to 10 of these headers may be present.
 * - The * part of the header name is replaced with the name of a custom field in the file
 *   information stored with the file, and the value is an arbitrary UTF-8 string, percent-encoded.
 * - The same info headers sent with the upload will be returned with the download.
 * - The header name is case insensitive.
 */
export interface BackblazeInfoHeaders {
  /**
   * The value should be a base 10 number which represents a UTC time when the
   * original source file was last modified. It is a base 10 number of milliseconds
   * since midnight, January 1, 1970 UTC. This fits in a 64 bit integer.
   */
  "X-Bz-Info-src_last_modified_millis"?: string;
}
export interface BackblazeInfoHeadersDownload extends BackblazeInfoHeaders {
  "X-Bz-Info-b2-content-disposition"?: string;
  "Content-Disposition"?: string;
  "Content-Encoding"?: string;
  "Content-Language"?: string;
  "Content-Location"?: string;
  "Content-Range"?: string;
  Expires?: string;
}
export interface BackblazeInfoHeadersUpload extends BackblazeInfoHeaders {
  "Content-Disposition"?: never;
  "Content-Encoding"?: never;
  "Content-Language"?: never;
  "Content-Location"?: never;
  "Content-Range"?: never;
  Expires?: never;
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
  "X-Bz-Info-b2-content-disposition"?: string;
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
  "X-Bz-Info-b2-content-language"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Expires' header when the file is downloaded
   * (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-expires header.
   * Instead, it (or the value specified in a request) will be in the Expires header.
   */
  "X-Bz-Info-b2-expires"?: string;
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
  "X-Bz-Info-b2-cache-control"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Content-Encoding' header when the file
   * is downloaded (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-encoding header.
   * Instead, it (or the value specified in a request) will be in the Content-Encoding header.
   */
  "X-Bz-Info-b2-content-encoding"?: string;
  /**
   * If this is present, B2 will use it as the value of the 'Content-Type' header when the file is downloaded
   * (unless it's overridden by a value given in the download request).
   *
   * The value must match the grammar specified in RFC 2616.
   *
   * Note that this file info will not be included in downloads as a x-bz-info-b2-content-type header.
   * Instead, it (or the value specified in a request) will be in the Content-Type header.
   */
  "X-Bz-Info-b2-content-type"?: string;
}
