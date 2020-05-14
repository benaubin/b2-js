<h1 align="center">Welcome to b2-js 👋</h1>
<p>
  <a href="https://www.npmjs.com/package/b2-js" target="_blank">
    <img alt="Version" src="https://img.shields.io/npm/v/b2-js.svg">
  </a>
  <a href="https://github.com/benaubin/b2-js#readme" target="_blank">
    <img alt="Documentation" src="https://img.shields.io/badge/documentation-yes-brightgreen.svg" />
  </a>
  <a href="https://github.com/benaubin/b2-js/graphs/commit-activity" target="_blank">
    <img alt="Maintenance" src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" />
  </a>
  <a href="https://github.com/benaubin/b2-js/blob/master/LICENSE" target="_blank">
    <img alt="License: MIT" src="https://img.shields.io/github/license/benaubin/b2-js" />
  </a>
  <a href="https://twitter.com/BenAubin_" target="_blank">
    <img alt="Twitter: BenAubin_" src="https://img.shields.io/twitter/follow/BenAubin_.svg?style=social" />
  </a>
</p>

> A powerful library for using Backblaze B2.

### 🏠 [Homepage](https://github.com/benaubin/b2-js#readme)

## Install

```sh
yarn install
```

## Usage

```js
import B2 from "./src/b2";

const b2 = await B2.authorize({ applicationKeyId: "KEY_ID", applicationKey: "SECRET_KEY"});
const bucket = b2.bucket("bucket-name");

// Single-part upload (for content smaller than ~100MB)
bucket.upload("test.txt", Buffer.from("foobar")) // Buffer content-length is automatically detected to determine which upload type to attempt.

const stream = require("fs").createReadStream("./README.md")
bucket.upload("readme", stream, {contentLength: 2174}) // In order to conduct a single-part upload with a stream,
                                                       // the content length of the stream in bytes must be known.
                                                       // Otherwise, a multi-part upload will be attempted.
                                                       // It is STRONGLY recommended to pass `contentLength` whenever possible
                                                       // to minimize the number of requests which must be attempted.
```

## Author

👤 **Ben Aubin (benaubin.com)**

* Website: benaubin.com
* Twitter: [@BenAubin\_](https://twitter.com/BenAubin\_)
* Github: [@benaubin](https://github.com/benaubin)
* LinkedIn: [@benaubin](https://linkedin.com/in/benaubin)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/benaubin/b2-js/issues). You can also take a look at the [contributing guide](https://github.com/benaubin/b2-js/blob/master/CONTRIBUTING.md).

## Show your support

Give a ⭐️ if this project helped you!

## 📝 License

Copyright © 2020 [Ben Aubin (benaubin.com)](https://github.com/benaubin).<br />
This project is [MIT](https://github.com/benaubin/b2-js/blob/master/LICENSE) licensed.
