var http = require("http");
var fs = require("fs");

// データ保存ディレクトリ
var port = 8080;

var server = http.createServer(function (req, res) {
    try {
        console.log("request url:" + req.url);
        if (req.url == "/") {
            req.url = "/index.html";
        }
        var path = require("path").join('./', req.url);
        var ctype = getContentType(path);
        try {
            var response = function (err, data) {
                res.writeHead(200, { "Content-Type": ctype });
                res.end(data);
            }
            switch(ctype) {
                case CONTENT_TYPE[".jpg"]:
                case CONTENT_TYPE[".jpeg"]:
                case CONTENT_TYPE[".png"]:
                case CONTENT_TYPE[".gif"]:
                    fs.readFile(path, response);
                    break;
                default:
                    fs.readFile(path, "utf-8", response);
                    break;
            }
        }
        catch (e) {
            res.writeHead(404, { "Content-Type": "text.html" });
            var message = "ファイルが見つかりません。\npath:" + path + "\n" + e.stack;
            res.end(message);
        }
    }
    catch (e) {
        console.log(e.stack);
    }
}).listen(process.env.PORT || port);


var CONTENT_TYPE =
{
    ".html": "text/html",
    ".txt": "text/plain",
    ".css": "text/css",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".js": "application/javascript",
};

/// <summary>コンテンツタイプを返します</summary>
function getContentType(name)
{
    var ext = require("path").extname(name).toLowerCase();
    var ctype = CONTENT_TYPE[ext];
    return (ctype ? ctype : "text/html");
}
