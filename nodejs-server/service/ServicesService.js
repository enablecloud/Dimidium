'use strict';
var Fs = require('fs');
var File = require('../tools/LoadFile');
var Config = require('../tools/Config');
var Helm = require('../kubernetes/helm/HelmService');
var Yaml1 = require('js-yaml');
var YAML = require('yamljs');
var MongoDBService = require('../store/MongoDBService');
var ReqUser = require('../tools/ReqUser');

function print(err, result) {
  console.log(JSON.stringify(err || result, null, 2));
}


const getTemp = function () {
  var path = "/tmp";
  if (process.argv.indexOf("--temppath") != -1) { //does our flag exist?
    path = process.argv[process.argv.indexOf("--temppath") + 1]; //grab the next item
  }

  return path;
}



exports.listService = function (body, res) {
  console.log("UserName:" + ReqUser.getUserName(body['authJWT']));
  var str = JSON.stringify(body);
  Helm.getList( function (errList, resultList) {
    try {
      if (errList) {
        res.statusCode = 500;
        res.end(errList);
        return;
      }
      var result = resultList['body']['data'];
      for (var resulUni in result) {
        delete result[resulUni]._id;
        result[resulUni].name = result[resulUni].id;
        result[resulUni].description = result[resulUni].attributes.description;
      }
      var fileName = "static/services.json";
      File.loadFile(fileName, data => {
        res.end(JSON.stringify(JSON.parse(data).concat(result)));
      }, () => {
        res.end(JSON.stringify(result));
      });
    } catch (e) {
      console.error(e);
    }
    /*
    MongoDBService.listDocuments('helmrepo',function(err,result){
      if(err){
        res.statusCode=500;
        res.end(err);
        console.log(JSON.stringify(err));
        return;
      }
      for (var resulUni in result) {
        delete result[resulUni]._id;
        result[resulUni].name=Config.getRepoName()+"/"+result[resulUni].name;
      }
      var fs = require("fs");
      var fileName = "static/services.json";
      File.loadFile(fileName,data=>{res.end(JSON.stringify(JSON.parse(data).concat(result)));},()=>{res.end();})
      //res.end(JSON.stringify(result));
      
    });*/
  });





};

exports.deleteService = function (body, res) {
  var str = JSON.stringify(body);
  var id = body['id'].value;
  MongoDBService.deleteDocument('helmrepo', {
    id: id
  }, function (err, result) {
    if (err) {
      res.statusCode = 500;
      res.end(err);
      return;
    }

    res.end();
  });



  //File.loadFile(fileName,data=>{res.end(data);},()=>{res.end();})


};



exports.uploadService = function (body, res) {

  var file = body.upfile.originalValue.originalname;
  var buffer = body.upfile.originalValue.buffer;
  var categoryName = body['categoryName'].value;
  console.log('file %s categoryName %s buffer %s', file, categoryName);
  var str = JSON.stringify(body);

  var indexPath = getTemp() + "/dimidium-" + Math.floor(Math.random() * 1000000000);
  Fs.mkdirSync(indexPath);
  var chartsPath = indexPath + "/charts";
  Fs.mkdirSync(chartsPath);

  Fs.writeFileSync(chartsPath + "/" + file, buffer);
  console.log("The file was saved! %s.", chartsPath + "/" + file);
  Helm.repoIndex(chartsPath, categoryName);
  var fileName = chartsPath + "/index.yaml";
  var brutYaml = File.loadFileSync(fileName);
  var transformed = Yaml1.safeLoad(brutYaml);
  for (var key in transformed['entries']) {
    var principalnode = transformed['entries'][key];
    var id = (categoryName + "_" + principalnode[0]['name'] + "-" + principalnode[0]['version']);
    principalnode[0].id = id;
    principalnode[0].category = (categoryName);
    principalnode[0].originalname = principalnode[0].name;
    principalnode[0].name = categoryName + "/" + principalnode[0].name;
    principalnode[0].completefilename = categoryName + '_' + file;
    principalnode[0].filename = file;

    MongoDBService.listDocuments('helmrepo', function (err, result) {
      if (err) {
        res.statusCode = 500;
        res.end(err);
        console.log(JSON.stringify(err));
        return;
      }
      var found = false;
      for (var resulUni in result) {
        console.log('Config exists ', result[resulUni].id);
        console.log('Config exists ', result[resulUni].id);
        if (id == result[resulUni].id) {
          console.log('Config exists ', id);
          res.statusCode = 409;
          res.end('Chart ' + id + ' exists !')
          return;
        }
      }
      console.log('Save config  ', principalnode[0].id);
      MongoDBService.pushDocument('helmrepo', principalnode[0], print);
      MongoDBService.pushStream(categoryName + '_' + file, Fs.createReadStream(chartsPath + "/" + file), print);
      res.end('Chart ' + id + ' saved !');
    });


  }


};


exports.downloadChart = function (body, res) {
  var str = JSON.stringify(body);

  var categoryName = body['categoryName'].value;
  var fileName = body['fileName'].value;
  console.log('file %s categoryName %s buffer %s', fileName, categoryName);


  MongoDBService.downloadStream(categoryName + '_' + fileName, function (data) {
    res.end(data);
  }, print);




};

exports.downloadIndex = function (body, res) {
  var str = JSON.stringify(body);


  MongoDBService.listDocuments('helmrepo', function (err, result) {
    if (err) {
      res.statusCode = 500;
      console.log(JSON.stringify(err));
      res.end(JSON.stringify(err));
      return;
    }
    /** 
    apiVersion: v1
    entries:
      alpine:
        - created: 2016-10-06T16:23:20.499814565-06:00
    */
    var indexYaml = {
      apiVersion: 'v1',
      entries: {}
    };

    for (var resulUni in result) {
      var name = result[resulUni].name;
      if (!indexYaml['entries'][name]) {
        indexYaml['entries'][name] = [];
      }
      indexYaml['entries'][name].push(result[resulUni]);

    }

    res.end(YAML.stringify(JSON.parse(JSON.stringify(indexYaml))));
  });






};