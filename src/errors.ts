export class BackblazeLibraryError extends Error {}

export namespace BackblazeLibraryError {
  export class BadUsage extends Error {}

  export class Internal extends Error {}
}

class BackblazeServerError extends BackblazeLibraryError {
  readonly apiData: BackblazeErrorResponse;

  constructor(apiData: BackblazeErrorResponse) {
    super(apiData.message);
    this.apiData = apiData;
  }
}

export interface BackblazeErrorResponse {
  status: number;
  code: string;
  message: string;
}

namespace BackblazeServerError {
  export class UnknownServerError extends BackblazeServerError {}

  /**
   * The request had the wrong fields or illegal values.
   * The message returned with the error will describe the problem.
   */
  export class BadRequest extends BackblazeServerError {}

  export class UsageCapExceeded extends BackblazeServerError {}
  export class DownloadCapExceeded extends UsageCapExceeded {}

  /** The auth token is valid, but does not allow you to make this call with these parameters */
  export class UnauthorizedRequest extends BackblazeServerError {}

  /** We normally try to reauthorize once before throwing this.  */
  export class ExpiredCredentials extends BackblazeServerError {}

  /** You have a reached a storage cap limit, or account access may be impacted in some other way; see the human-readable message. */
  export class Forbidden extends BackblazeServerError {}

  /** The service timed out trying to read your request. */
  export class RequestTimeout extends BackblazeServerError {}

  /** B2 may limit API requests on a per-account basis. */
  export class TooManyRequests extends BackblazeServerError {}

  export class InternalServerError extends BackblazeServerError {}

  export class RangeNotSatisfiable extends BackblazeServerError {}

  export class ServiceUnavailable extends BackblazeServerError {}
}

export default BackblazeServerError;
