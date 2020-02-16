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

let totalFiles = [], requiredCompressionFiles = [], successFiles = [], errorFiles = [], successSize = 0

const getCompressedPicUrl = async (src, target) => {
    const readStream = fs.createReadStream(src);
    try {
        const { data } = await axios.post('https://tinypng.com/web/shrink', readStream)
        const { input, output } = data
        successFiles.push(src)
        successSize += output.size
        console.log(`✅: ${chalk.red(src)}(${chalk.red(prettyBytes(input.size))}) => ${chalk.green(target)}(${chalk.green(prettyBytes(output.size))})`)
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

const isRequiredCompression = (src) => {
    const fileSize = fs.statSync(src).size
    const ext = path.parse(src).ext
    const filePathArray = src.split('/')
    const filename = filePathArray[filePathArray.length -1]

    if (!/\.(png|jp(e?)g)/.test(ext) || fileSize <= program.limitSize * 1000) {
        console.log(`✅: ${chalk.green(`${filename} not required compression`)}`)
        const resultPath = path.join(program.outDir, ...filePathArray.splice(1, filePathArray.length - 1))
        outputFileSync(resultPath, fs.readFileSync(src))
        return false
    }
    return true
}

const upload = async (src) => {
    const filePathArray = src.split('/')
    const filename = filePathArray[filePathArray.length -1]

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
program.option("-c, --concurrent [count]", "Limit Compression Concurrency, default: 5", 5);
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
    console.log(`🚀: ${chalk.hex('#cc5f18')(`Total Files: ${totalFiles.length}`)}
     => ${chalk.hex('#cc5f18')(`Require Compression Files: ${requiredCompressionFiles.length}`)}`)
    console.log(`✅: ${chalk.green(`Success: ${successFiles.length}`)}`)
    if(errorFiles.length) {
        console.log(`❌: ${chalk.red(`Failed: ${errorFiles.length} => ${errorFiles}`)}`)
    }
    const requiredCompressionFilesTotalSize = requiredCompressionFiles.reduce(((previousValue, current) => previousValue + fs.statSync(current).size), 0)
    console.log(`🚅: ${chalk.red(prettyBytes(requiredCompressionFilesTotalSize))} => ${chalk.green(prettyBytes(successSize))}`)
}

const uploadFile = async () => {
    const stat = fs.statSync(filename);
    if (stat.isDirectory(filename)) {
        const dirname = filename;
        readdir(dirname).forEach(async function (filename) {
            const src = path.join(dirname, filename);
            totalFiles.push(src)
            if(isRequiredCompression(src)) {
                requiredCompressionFiles.push(src)
            }
        });
        try {
            await Promise.map(requiredCompressionFiles, uploadTask => {
                return upload(uploadTask)
            }, program.concurrent)
        } catch (e) {}
    } else {
        totalFiles.push(filename)
        try {
            if(isRequiredCompression(filename)) {
                requiredCompressionFiles.push(filename)
                await upload(filename)
            }
        } catch (e) {}
    }
    fileUploadStatusLog()
}

uploadFile()
