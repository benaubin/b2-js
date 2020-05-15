<h1> <img src="https://www.backblaze.com/blog/wp-content/uploads/2017/12/backblaze_icon_transparent.png" alt="Backblaze logo" width="32"> Backblaze B2 JavaScript Client </h1>

<p>
  <a href="https://www.npmjs.com/package/b2-js" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/b2-js.svg">
  </a>
  <a href="https://github.com/benaubin/b2-js/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/benaubin/b2-js/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/benaubin/b2-js" />
  </a>
  <a href="https://codeclimate.com/github/benaubin/b2-js/maintainability">
    <img alt="Code Climate Maintainability" src="https://api.codeclimate.com/v1/badges/1124a063a4644aae3d3e/maintainability" />
  </a>
  <a href="https://twitter.com/BenAubin_" target="_blank">
    <img alt="Twitter: BenAubin_" src="https://img.shields.io/twitter/follow/BenAubin_.svg?style=social" />
  </a>
</p>

A powerful library for using Backblaze B2.

✅ Streaming uploads (automatic switching between single and multi-part)<br/>
✅ Single-part uploads<br/>
✅ Streaming downloads<br/>
✅ Graceful error handling (exponential back-off)<br/>
✅ Requires ES2018<br/>
✅ Used in production at [Mintere](https://mintere.com)<br/>
🚫 Browser Not Supported (uses `node-fetch` and `streams`)

### 📜 [Documentation](https://b2-js.netlify.app/)


<a href="https://mintere.com">
  <img src="https://app.mintere.com/assets/logo-no-space-cae371bbf448f4dcc2596ff65617601dea1da09e35fd5a217039642a93752517.png" width="100"/>
</a>

Developed for <a href="https://mintere.site">Mintere Sites</a>, a platform enabling 
websites to be global, easy-to-develop, performant and dynamic.

## Install

```sh
npm install b2-js
```

```
yarn install b2-js
```

## Principles

- Backblaze allows uploading files as a single-part or as multiple parts.
  However, you must know the length of each file in advance, and you cannot
  use chunked-encoding.
- Single-part uploads are generally faster for smaller files. Backblaze recommends
  a part-size.
- The library should handle the complexity of working with the B2 API, including
  handling splitting streams into multi-part uploads.

## Key Considerations

- For streams of unknown length, each part must be read into memory (up-to 100MB). 
  You can configure this down to `b2.auth.absoluteMinimumPartSize` using `b2.partSize = BYTES`.
- It's generally faster to use single part upload for smaller files. The library will make
  the decision for you based on `b2.partSize`.

## Usage

```js
import B2 from "./src/b2";

const b2 = await B2.authorize({ applicationKeyId: "KEY_ID", applicationKey: "SECRET_KEY"});
const bucket = b2.bucket("bucket-name");
```

### Uploading

#### Buffers

When uploading Buffers, the library automatically decides whether to conduct a single or multi-part
upload based on the Buffer's `byteLength`.

```js
// a single-part upload will be attempted.
bucket.upload("test.txt", Buffer.from("foobar"));

// a multi-part upload will automatically be attempted for larger files
bucket.upload("test.txt", Buffer.from("*".repeat(101*1000*1000 /* 101MB */)));
```

#### Streams

When the `contentLength` is known, you may conduct a single part upload without
loading the stream into memory.

```js
const fileStream = require("fs").createReadStream("./README.md")
// In order to conduct a single-part upload without loading a stream
// into memory, the content length of the stream in bytes must be known.
bucket.uploadSinglePart("readme", fileStream, {contentLength: 2174}) 
```

When the `contentLength` is unknown, or a stream is too large for a single-part upload,
each part of the stream must be loaded into memory in order to size the stream,
compute a digest of the content and properly split the stream into parts. 

If the stream less than or equal to `b2.partSize` bytes, a single-part upload will
be attempted. Otherwise, a multi-part upload will be attempted by loading up-to 
`b2.partSize` bytes of the stream into memory at a time.

```js
const file = bucket.file("example");
const stream = file.createWriteStream();

stream.on("error", (err) => {
  // handle the error 
  // note that retries are automatically attempted before errors are 
  // thrown for most potentially recoverable errors, as per the B2 docs.
})

stream.on("finish", (err) => {
  // upload done, the file instance has been updated to reflect this
})

res.body.pipe(stream);
```


### Downloading
```js
const file = bucket.file("text.txt");
file.createReadStream();
```

### Stat

#### By id

```js
const file = bucket.file({fileId: "...."});
const fileData = await file.stat(); //=> see https://www.backblaze.com/b2/docs/b2_get_file_info.html
```

#### By name

Note that statting a file by name involves a Class C transaction
as it involves listing files with a call to `b2_list_file_names`.

```js
const file = bucket.file("text.txt");
try {
  const fileData = await file.stat(); //=> see https://www.backblaze.com/b2/docs/b2_get_file_info.html
} catch (e) {
  if (e instanceof BackblazeLibraryError.FileNotFound) {
    // handle file not found.
  } else {
    throw e;  // re-throw the error unchanged
  }
}
```

## Author

👤 **Ben Aubin (benaubin.com)**

* Website: benaubin.com
* Twitter: [@BenAubin\_](https://twitter.com/BenAubin\_)
* Github: [@benaubin](https://github.com/benaubin)
* LinkedIn: [@benaubin](https://linkedin.com/in/benaubin)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/benaubin/b2-js/issues). You can also take a look at the [contributing guide](https://github.com/benaubin/b2-js/blob/master/CONTRIBUTING.md).

## Users

- [Mintere](https://mintere.com) uses `b2-js` to serve static assets for its CDN and to deploy files on servers around the world.

Using `b2-js` in production? Submit a PR to add yourself to this list!

## Show your support

Give a ⭐️ if this project helped you!

## 📝 License

Copyright © 2020 [Ben Aubin (benaubin.com)](https://github.com/benaubin).<br />
This project is [MIT](https://github.com/benaubin/b2-js/blob/master/LICENSE) licensed.

