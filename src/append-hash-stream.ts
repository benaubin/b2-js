import { Transform, TransformCallback } from "stream";
import { createHash, Hash } from "crypto";

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
    this.push(this.hash.digest("hex"), "utf-8")
  }
}