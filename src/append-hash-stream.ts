import { Transform, TransformCallback } from "stream";
import { createHash, Hash } from "crypto";

/** 
 * Passes through its contents and ammends a hex-encoded hash of the data upon "end".
 * 
 * @internal 
 */
export default class AppendHashStream extends Transform {
  hash: Hash

  constructor(algorithm: string = "sha1") {
    super();

    this.hash = createHash(algorithm);
  }

  _transform(chunk: Buffer, _: BufferEncoding, callback: TransformCallback) {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  _flush() {
    this.push(this.digest(), "utf-8");
  }

  private _digest?: string;
  digest() { 
    if(typeof this._digest !== "undefined") return this._digest;

    return (this._digest = this.hash.digest("hex"))
  }
}