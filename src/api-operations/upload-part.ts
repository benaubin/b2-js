import BackblazeServerError from "../errors";
import fetch from "node-fetch";

export interface PartUploadResultData {
  fileId: string;
  partNumber: string;
  contentLength: string;
  contentSha1: string;
  contentMd5?: string;
  uploadTimestamp: string;
}

export interface MultipartUploadUrl {
  fileId: string;
  uploadUrl: string;
  authorizationToken: string;
}

export interface PartUploadResult {
  data: PartUploadResultData
  url: MultipartUploadUrl
}

export default async function uploadPart(
  partNumber: number,
  buffer: ArrayBuffer,
  sha1: string,
  _uploadUrl: MultipartUploadUrl | undefined,
  getUploadUrl: () => Promise<MultipartUploadUrl>,
  maxRetries: number = 5,
  backoffRate: number = 150,
  retryN: number = 0
): Promise<PartUploadResult> {
  if (typeof _uploadUrl === "undefined") _uploadUrl = await getUploadUrl();
  const { uploadUrl, authorizationToken } = _uploadUrl;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: authorizationToken,
      "X-Bz-Content-Sha1": sha1,
      "X-Bz-Part-Number": partNumber.toString(),
      "Content-Length": buffer.byteLength.toString(),
    },
    body: buffer,
  });

  const data = await res.json();

  switch (res.status) {
    case 200:
      return {data, url: _uploadUrl};
    case 401: /** auth expired - get a new upload url */
      if(retryN > maxRetries)
        throw new BackblazeServerError.UnauthorizedRequest(data);
    case 503: /** service unavailable - get a new upload url */
      if(retryN > maxRetries)
        throw new BackblazeServerError.ServiceUnavailable(data);
      return uploadPart(partNumber, buffer, sha1, await getUploadUrl(), getUploadUrl, maxRetries, backoffRate, retryN + 1);
    case 408: /** timeout, exponential back-off */
      if(retryN > maxRetries)
        throw new BackblazeServerError.RequestTimeout(data);
      
      return new Promise((res) => {
        setTimeout(async () => {
          res(uploadPart(partNumber, buffer, sha1, _uploadUrl, getUploadUrl, maxRetries, backoffRate, retryN + 1));
        }, backoffRate * Math.pow(2, retryN));
      });
    default:
      throw new BackblazeServerError.UnknownServerError(data);
  }
}