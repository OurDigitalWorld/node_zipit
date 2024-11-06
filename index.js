/*
    index.js - work with ODW zip archive layout

    This is one approach to work with byte range requests against
    a zip archive. 

    The ZIP format is described in these sources:

        https://docs.fileformat.com/compression/zip/
        https://users.cs.jmu.edu/buchhofp/forensics/formats/pkzip.html

    For more details, see the documentation here:

        https://github.com/OurDigitalWorld/node_zipit

    - art rhyno, u. of windsor & ourdigitalworld
*/

//this value needs to reflect where the issues are located
const BASE_URL = "https://ourontario.ca/downloads/AECHO/1875_01";
//this value is the port for node
const PORT = 3000
//this is the timeout for URL requests
const TIMEOUT = 5000

//zip format values, these should not need to be changed
const CENTRAL_DIR_START = 46; //we look for the file name, which starts in this position
const FILE_NAME_LEN_POS = 28; //position of file name len (always get this from directory!)
const EXTRA_FIELD_LEN_POS = 30; //position of extra field len (if any)
const FIELD_COMMENT_LEN_POS = 32; //positon of field comment (if any)
const COMP_SIZE_POS = 20; //position of size of file (we don't deal with compression so matches original)
const REL_OFFSET_POS = 42; //offset from base_pos of archive to local file header
const LOCAL_FILE_HEADER_LEN = 30; //length of local file header (which we will skip)

var async = require('async')
var express = require('express')
var app = express()

//convert 4 byte value to int
function sortOutInt4(data,pos) {
    var u32bytes = data.buffer.slice(pos, pos + 4);
    var uint = new Uint32Array(u32bytes)[0];
    return uint;
}//sortOutInt4

//convert 2 byte value to int
function sortOutInt2(data,pos) {
    var u16bytes = data.buffer.slice(pos, pos + 2);
    var uint = new Uint16Array(u16bytes)[0];
    return uint;
}//sortOutInt2

//issue should contain everything to get to odw.json
async function sortOutZipSpec(issue) {
    var issue_parts = issue.split("/");
    var page = issue_parts.pop();
    var page_ident = issue_parts.join("/");
    var json_url = BASE_URL + "/" + issue_parts[0] + "/odw.json";
    var this_spec = null;

    if (page && issue) {
         const json_file = await fetch(json_url).then(res => res.json())
         for (var zip_offset of json_file.zip_offsets) {
             if (zip_offset.ident.includes(page_ident) &&
                 zip_offset.ztype.includes("tiles"))
             {
                 this_spec = { zip_url: json_url.replace(".json",".zip"),
                              coll_offset: zip_offset.coll_offset,
                              dir_offset: zip_offset.dir_offset,
                              dir_size: zip_offset.dir_size };
                 break;
             }//if
         }//for
    }//if

    return this_spec;
}//sortOutZipSpec

//use byte-ranges to extract zip content
sortOutZipObj = async function(ident,zip_url,dir_size,coll_offset,
    dir_offset,callback) 
{
    var obj_offset = 0;
    var obj_size = 0;

    if (dir_offset > 0 && dir_size > 0) {
        await require('axios').get(zip_url, { timeout: TIMEOUT,
            headers: {"Range":"bytes=" + dir_offset + "-" +
                (dir_offset + (dir_size -1))}, responseType: 'arraybuffer' })
        .then((response) => {
            return Buffer.from(response.data, "utf-8")
        })
        .catch((error) => {
            console.log("ERROR",error);
            callback("directory error obj offset: " + obj_offset +
                 " dir_size: " + dir_size);
        })
        .then((buffer) => {
            var cdr_len = buffer.length;
            var base_pos = 0;
            //loop through ZIP directory
            while ((base_pos + FIELD_COMMENT_LEN_POS) < cdr_len) {
                var fn_len = sortOutInt2(buffer,base_pos + FILE_NAME_LEN_POS);
                var ef_len = sortOutInt2(buffer,base_pos + EXTRA_FIELD_LEN_POS);
                var fc_len = sortOutInt2(buffer,base_pos + FIELD_COMMENT_LEN_POS);
                var fn_offset = base_pos + CENTRAL_DIR_START;
                var ufn = buffer.buffer.slice(fn_offset, fn_offset + fn_len);
                //need to change encoding for string matching
                var fn = new TextDecoder('ascii').decode(ufn);
                if (fn.includes(ident)) {
                    obj_size = sortOutInt4(buffer,base_pos + COMP_SIZE_POS);
                    obj_offset = sortOutInt4(buffer,base_pos + REL_OFFSET_POS);
                    obj_offset = obj_offset + coll_offset + 
                        LOCAL_FILE_HEADER_LEN + fn_len + ef_len + fc_len;
                    break;
                }//if
                base_pos += (CENTRAL_DIR_START + fn_len + ef_len + fc_len);
            }//while

            if (obj_offset > 0 && obj_size > 0) {
                require('axios').get(zip_url, {timeout: TIMEOUT, headers: {"Range":"bytes=" +
                    obj_offset + "-" +
                    (obj_offset + (obj_size -1))}, responseType: 'arraybuffer' })
                .then((response) => {
                    if (response) {
                        callback(null, Buffer.from(response.data, "utf-8"));
                    } else {
                        callback("directory error img_offset: " + obj_offset +
                            " dir_size: " + dir_size);
                    }//if
                });
            }//if
        });
    }//if
}//sortOutZipObj

//use the specified path to pull together the coordinates for accessing the tiles
async function sortOutReq(res,path) {
    var zip_path = path;
    if (!zip_path.includes("tiles") && zip_path.includes("info.json")) 
        zip_path = zip_path.replace("info.json","tiles/info.json");
    var zip_parts = zip_path.split("/tiles/");
    var zip_spec = null;

    zip_spec = await sortOutZipSpec(zip_parts[0]);

    if (zip_spec && zip_spec.zip_url && 
	zip_spec.dir_size >= 0 && zip_spec.coll_offset >= 0 && 
	zip_spec.dir_offset >= 0)
    {
        sortOutZipObj(zip_parts[1],zip_spec.zip_url,zip_spec.dir_size,
            zip_spec.coll_offset, zip_spec.dir_offset, function(error,obj) 
        {
            if (!error && obj) {
                if (zip_parts[1].includes(".json")) {
                    res.setHeader('Content-Type', 'application/json');
                } else {
                    res.setHeader('Content-Type', 'image/jpg');
                }
                res.send(obj);
            }
        });
    }//if
}//sortOutReq

//expect a path 
app.get('/', function (req, res) {
    sortOutReq(res,req.query.path);
})

app.listen(PORT, function () {
     console.log('Listening on ' + PORT)
})
