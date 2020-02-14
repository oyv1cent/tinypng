#!/usr/bin/env node
const axios = require("axios");
const packageJson = require('./package');
const program = require('commander');
const fs = require('fs');
const path = require('path');
const outputFileSync = require("output-file-sync");
const readdir = require("fs-readdir-recursive");
const chalk = require('chalk');
const prettyBytes = require('pretty-bytes');
require("./utils/promise-map");

let totalFile = 0, successFile = 0, totalSize = 0, successSize = 0, errorFiles = []

const getCompressedPicUrl = async (src, target) => {
    const readStream = fs.createReadStream(src);
    try {
        const { data } = await axios.post('https://tinypng.com/web/shrink', readStream)
        const { input, output } = data
        successFile++
        successSize += output.size
        console.log(`✅${chalk.red(src)}(${chalk.red(prettyBytes(input.size))}) => ${chalk.green(target)}(${chalk.green(prettyBytes(output.size))})`)
        return output.url
    } catch (e) {
        errorFiles.push(src)
        console.log(`❌: ${chalk.red(src)}`)
    }
}

const download = async (url, output) => {
    const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            'Content-Type': 'image/png',
        },
    })
    outputFileSync(output, data)
}

const upload = async (src) => {
    totalFile++
    const fileSize = fs.statSync(src).size
    totalSize += fileSize
    const filePathArray = src.split('/')
    const filename = filePathArray[filePathArray.length -1]
    const ext = path.parse(src).ext
    if (!/\.(png|jp(e?)g)/.test(ext) || fileSize <= program.limitSize * 1000) {
        successFile++
        successSize += fileSize
        console.log(`✅ ${chalk.green(`${filename} not required compression`)}`)
        const resultPath = path.join(program.outDir, ...filePathArray.splice(1, filePathArray.length - 1))
        outputFileSync(resultPath, fs.readFileSync(src))
        return
    }

    const { outFile, outDir } = program
    let output = outFile
    if (outDir) {
        if(filePathArray.length > 2) {
            output = path.join(outDir, ...filePathArray.splice(1, filePathArray.length - 2), path.parse(src).name + '.png')
        } else {
            output = path.join(outDir, path.parse(src).name + '.png')
        }
    }
    if (!outFile && !outDir) {
        output = path.parse(filename).name + '_compressed.png'
    }
    const url = await getCompressedPicUrl(src, output)
    return download(url, output)
}

program.option("-o, --out-file [out]", "compress the input image into a single file");
program.option("-d, --out-dir [out]", "compress the input image(s) into an output directory");
program.option("-c, --concurrent [count]", "Limit Compression Concurrency, default: 3", 3);
program.option("-s, --limit-size [count]", "Compression Limit Size(kb), default: 10", 10);
program.version(packageJson.version, '-v, --version');
program.usage("[options] <file or directory...>");
program.parse(process.argv);

const errors = []
const filename = program.args[0]

if (program.outFile && program.outDir) {
    errors.push("cannot have --out-file and --out-dir");
}

if (program.outFile && !program.outFile.endsWith(".png")) {
    errors.push("outFile have to .png as the extension");
}

if (!filename) {
    errors.push("filenames is required");
}
try {
    const stat = fs.statSync(filename);
    const isDirectory = stat.isDirectory(filename)
    if (isDirectory && !program.outDir) {
        errors.push("--out-dir required for directory");
    }
} catch (e) { }

if (errors.length) {
    console.error("❌ : " + errors.join("\n❌ : "));
    process.exit(2);
}

const fileUploadStatusLog = () => {
    console.log(chalk.hex('#21ccb2')('==================Finished==================='))
    console.log(`🚀: Total: ${chalk.green(`${totalFile}`)}`)
    console.log(`✅: Success: ${chalk.green(`${successFile}`)}`)
    if(errorFiles.length) {
        console.log(`❌: Filed: ${chalk.red(`${errorFiles.length} => ${errorFiles}`)}`)
    }
    console.log(`🚅: ${chalk.red(prettyBytes(totalSize))} => ${chalk.green(prettyBytes(successSize))}`)
}

const uploadFile = async () => {
    const stat = fs.statSync(filename);
    if (stat.isDirectory(filename)) {
        const dirname = filename;
        const uploadList = []
        readdir(dirname).forEach(async function (filename) {
            const src = path.join(dirname, filename);
            uploadList.push({ src })
        });
        try {
            await Promise.map(uploadList, uploadTask => {
                const { src } = uploadTask
                return upload(src)
            }, program.concurrent)
        } catch (e) {}
    } else {
        try {
            await upload(filename, filename);
        } catch (e) {}
    }
    fileUploadStatusLog()
}

uploadFile()
