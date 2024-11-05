# node_zipit
This is an example of using Node.js to serve tiles to a IIIF viewer from a ZIP
archive. To get around http/https mismatches, it is probably easiest to use
relative paths. For example:
```
    http://localhost/uv.html#?manifest=/AECHO/1875_01/AECHO_18750101/manifest.json
```
The _manifest.json_ file in this case would use a service id that reflects the
proxy mapping. For example, if Node is mapped as _ziptit_ through a proxy, the _service_ id
for the first page could be:
```
    "service": {
         "@context": "http://iiif.io/api/image/2/context.json",
         "@id": "/zipit/?path=AECHO_18750101/1875-01-01-0001",
          "profile": "http://iiif.io/api/image/2/level2.json"
    }
```
The _BASE_URL_ value in _index.js_ defines where the _odw.json_ file that 
specifies offsets is located. ZIP uses a directory structure that identifies
all of the files contained in an archive. The approach has been to use
one _odw.json_ file per newspaper issue.

To run this example, clone the reposity and use the regular _npm_ commands:
```
npm install
npm start
```
There is not a lot of error handling in this setup but hopefully it
illustrates how the network interactions can work. One modification that
might be worthwhile is to add caching, which is well supported in Node.js.
