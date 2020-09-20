let fs = require('fs');
let path = require('path');
let write2file =  function (jsonObject) {

    let timelineposts = JSON.stringify(jsonObject);
    //console.log(timelineposts);
    let fileName = `puppeteer-insta-${Math.round((new Date()).getTime() / 1000)}.json`;
    console.log("saving "+fileName);
    console.log("writing to file .....");
    var baseDir = path.join(__dirname,`../jsons/`);
    fs.writeFileSync(`${baseDir}${fileName}`, timelineposts, 'utf8', (err) => {
        if (err) {
            console.log(err);
        }
        console.log("success....");
    });

    return true;
};



exports.write2file = write2file;
