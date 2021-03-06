/*
   Copyright 2018 getcarrier.io

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var RPClient = require('reportportal-client');
var fs = require('fs');
var utils = require('./utils')

function ReportPortal(config) {
    this.rpClient = new RPClient({
        token: config['token'],
        endpoint: config['url'],
        project: config['project'],
        debug: false
    });
    this.errors = {}
    this.success_pages = {}
    this.launch_name = config['launch_name']
    if (config['launch_tags'] != null && config['launch_name'] != undefined) {
        this.launch_tags = config['launch_tags']
    }
    this.image_path = `/tmp/reports/screenshots/`;
    this.lh_path = `/tmp/reports/lighthouse_pages/`;
}

ReportPortal.prototype.startTestLaunch = function (description) {
    var outer_this = this;
    var currentDate = new Date();
    var date = currentDate.getDate() + "/" + (currentDate.getMonth() + 1) + "/" + currentDate.getFullYear();
    this.launch = outer_this.rpClient.startLaunch({
        name: outer_this.launch_name || 'test_launch',
        start_time: outer_this.rpClient.helpers.now(),
        description: description,
        tags: outer_this.launch_tags || [date]
    });
}

ReportPortal.prototype.finishTestLaunch = function () {
    var outer_this = this;
    outer_this.rpClient.finishLaunch(outer_this.launch.tempId, {
        end_time: outer_this.rpClient.helpers.now()
    });
}

ReportPortal.prototype.startItem = function (name, description, tags) {
    var outer_this = this;
    var step = outer_this.rpClient.startTestItem({
        description: description,
        name: name,
        start_time: outer_this.rpClient.helpers.now(),
        type: "STEP",
        tags: tags
    }, outer_this.launch.tempId);
    return step
}

ReportPortal.prototype.finishItem = function (item_id, status) {
    var outer_this = this;
    outer_this.rpClient.finishTestItem(item_id, {
        end_time: outer_this.rpClient.helpers.now(),
        status: status
    })
}

ReportPortal.prototype.sendTestLog = function (step, level, message) {
    var outer_this = this;
    outer_this.rpClient.sendLog(step.tempId, {
        level: level,
        message: message,
        time: outer_this.rpClient.helpers.now()
    });
}

ReportPortal.prototype.sendTestLogWithFile = function (step, file_path, file_name, file_type, message) {
    var outer_this = this;
    file = file_path + file_name

    fs.readFile(file, { encoding: 'base64' }, function (err, data) {
        if (err) throw err;
        return outer_this.rpClient.sendLogWithFile(step.tempId, {
            level: "INFO",
            message: message,
            time: outer_this.rpClient.helpers.now()
        }, {
                name: file_name,
                type: file_type,
                content: data
            })
    })
}

ReportPortal.prototype.reportIssue = function (error, domain, url_path, page_name, driver, lh_name) {
    var outer_this = this;
    var status = 'ko';
    var err_message = "Open " + page_name + " failed"
    var error_id = error.toString().split(":")[0] + "_" + err_message.replace(/\s/g, "_")
    var tmp = new Date().getTime();
    var image_name = `${page_name}_${tmp}_Failed`;

    var step = outer_this.startItem(page_name, err_message, [page_name, domain])

    utils.takeScreenshot(driver, image_name)
        .then(() => outer_this.sendTestLogWithFile(step, outer_this.image_path, `${image_name}.png`, "image/png", `Screenshot: ${image_name}.png`))
        .catch(error => console.log("Failed to load screenshot.\n" + error))
        .then(() => outer_this.sendTestLogWithFile(step, outer_this.lh_path, `${lh_name}.html`, "xml", `Lighthouse result: ${lh_name}.html`))
        .then(() => outer_this.sendTestLog(step, 'ERROR', error_id))
        .then(() => outer_this.sendTestLog(step, 'WARN', `Test error: ${error}`))
        .then(() => outer_this.sendTestLog(step, 'WARN', `Error message: ${err_message}`))
        .then(() => outer_this.sendTestLog(step, 'WARN', `URL: ${domain}`))
        .then(() => {
            if (url_path) {
                outer_this.sendTestLog(step, 'WARN', `Path: ${url_path}`)
            }
        })
        .then(() => outer_this.sendTestLog(step, 'WARN', `Page name: ${page_name}`))
        .finally(() => outer_this.finishItem(step.tempId, 'failed'))


    return new Promise(function (resolve, reject) {
        resolve(status);
    })
}

ReportPortal.prototype.reportResult = function (page_name, url, path, driver, lh_name) {
    var outer_this = this;
    var tmp = new Date().getTime();
    var image_name = `${page_name}_${tmp}`

    var step = outer_this.startItem(page_name, `Results for ${page_name}`, [page_name, url]);
    
    utils.takeScreenshot(driver, image_name)
        .then(() => outer_this.sendTestLog(step, 'INFO', `Page name: ${page_name}`))
        .then(() => outer_this.sendTestLog(step, 'INFO', `URL: ${url}`))
        .then(() => {
            if (path) {
                outer_this.sendTestLog(step, 'INFO', `Path: ${path}`)
            }
        })
        .then(() => outer_this.sendTestLogWithFile(step, outer_this.image_path, `${image_name}.png`, "image/png", `Screenshot: ${image_name}.png`))
        .then(() => outer_this.sendTestLogWithFile(step, outer_this.lh_path, `${lh_name}.html`, "xml", `Lighthouse result: ${lh_name}.html`))
        .finally(() => outer_this.finishItem(step.tempId, 'passed'))

}

module.exports = ReportPortal;
