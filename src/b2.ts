import fetch, {RequestInit} from "node-fetch";
import { authorize, B2Credentials, AuthorizeAccountSuccessResponse } from "./api-operations/authorize-account";
import BackblazeServerError, { BackblazeErrorResponse } from "./errors";


export default class B2 {
  private credentials: B2Credentials;

  private auth: AuthorizeAccountSuccessResponse | undefined;

  static readonly apiVersion: string = "v5"

  private constructor(credentials: B2Credentials) {
    this.credentials = credentials;
  }

  private async authorize() {
    this.auth = await authorize(this.credentials);
  }

  static async authorize(credentials: B2Credentials): Promise<B2> {
    const b2 = new B2(credentials);
    await b2.authorize();
    return b2;
  }

  async request(operationName: string, request: RequestInit, retries: number = 0, maxRetries: number = 5, backoff: number = 150) {
    const url = [this.auth.apiUrl, "b2api", B2.apiVersion, operationName].join("/");

    const res = await fetch(url, {
      ...request,
      headers: {
        ...request.headers,
        "Authorization": this.auth.authorizationToken
      }
    })

    if(res.status === 200) {
      return res;
    } else {
      const data = await res.json() as BackblazeErrorResponse;
      switch (data.code) {
      case "bad_request": throw new BackblazeServerError.BadRequest(data);
      case "unauthorized": throw new BackblazeServerError.UnauthorizedRequest(data);
      case "bad_auth_token":
      case "expired_auth_token":
        if (retries < maxRetries) {
          await this.authorize();
          return this.request(operationName, request, retries + 1)
        } else {
          throw new BackblazeServerError.ExpiredCredentials(data)
        }
      default:
        switch (data.status) {
          case 400: throw new BackblazeServerError.BadRequest(data);
          case 403: throw new BackblazeServerError.Forbidden(data);
          case 408: throw new BackblazeServerError.RequestTimeout(data);
          case 500: throw new BackblazeServerError.InternalServerError(data);
          case 503: 
            if (retries < maxRetries) {
              return new Promise((res, rej) => {
                setTimeout(() => {
                  this.request(operationName, request, retries + 1, backoff * 2).then(res, rej);
                }, backoff * (0.5 + Math.random()));
              });
            } else {
              throw new BackblazeServerError.ServiceUnavailable(data)
            }
          default: throw new BackblazeServerError.UnknownServerError(data)
        }
      }
    }

  }

  bucket() {

  }
}