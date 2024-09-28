#!/usr/bin/env node

// @ts-check

import chalk from 'chalk';
import yargs from 'yargs';
import { ChildProcess, spawn } from 'child_process';
import { Subject } from 'rxjs';
import { argv, exit } from 'process';
import { basename, dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { glob } from 'glob';
import { hideBin } from 'yargs/helpers';

/**
 * @param {string} path
 * @param {'Source' | 'Spec tsconfig.json'} type
 */
function exists(path, type) {
    path = resolve(path);
    if (existsSync(path)) return path;
    throw new Error(`${type} file does not exist at ${path}.`);
}

/** @extends { Subject<string> } */
class SpawnSubject extends Subject {
    /**
     * @param {string} command
     * @param {string[]} args
     */
    constructor(command, args) {
        super();
        this.proc = spawn(command, args);
        this.proc.stdout.setEncoding('utf-8');
        this.proc.stdout.on('data', (chunk) => this.next(chunk));
        this.proc.on('error', (error) => this.error(error));
        this.proc.on('exit', () => this.complete());
        return this;
    }

    /** @override **/
    unsubscribe() {
        this.proc?.disconnect();
        super.unsubscribe();
    }
}

yargs(hideBin(argv))
    .command(
        'test',
        'Execute a test file',
        (yargs) => {
            return yargs
                .option('source', {
                    alias: 'src',
                    desc: 'Provide the name, relative path, or absolute path of a .spec.ts file',
                    type: 'string',
                    demandOption: true
                })
                .option('project', {
                    alias: 'p',
                    desc: 'Provide the path to a tsconfig.spec.json file.',
                    type: 'string',
                    demandOption: true,
                    coerce: (path) => exists(path, 'Spec tsconfig.json')
                })
                .option('watch', {
                    desc: 'Watch files for changes.',
                    type: 'boolean',
                    default: false
                });
        },
        async ({ source: srcNmOrPath, project: tsconfigPath, watch }) => {
            /**
             * Parsed `tsconfig.json` file.
             * @type {{ compilerOptions: { outDir: string } }}
             **/
            let tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

            /** `tsconfig.json` root directory. */
            const tsconfigDir = dirname(tsconfigPath);

            /** Resolved source `.spec` file. */
            const srcPath = await resolveSrcFile(srcNmOrPath, tsconfigDir);

            /** Output directory, resolved from `tsconfig`. */
            let outDir = join(tsconfigDir, tsconfig.compilerOptions.outDir);

            /** The name of the output file. */
            let outFile = basename(srcPath);
            outFile = outFile.substring(0, outFile.lastIndexOf('.'));

            /** @type {ChildProcess} */
            let nodeProc;

            const tscArgs = ['-p', tsconfigPath];
            if (watch) tscArgs.push('--watch');

            new SpawnSubject('tsc', tscArgs).subscribe({
                next: async (chunk) => {
                    if (formatTscMessage(chunk) && !nodeProc) {
                        outFile = await resolveOutFile(outDir, outFile);

                        const spawnArr = ['--enable-source-maps', outFile];
                        if (watch) spawnArr.unshift('--watch');

                        nodeProc = spawn('node', spawnArr, {
                            cwd: process.cwd(),
                            stdio: 'inherit'
                        });
                    }
                },
                error: (err) => console.error(err),
                complete: () => nodeProc?.disconnect()
            });
        }
    )
    .parse();

/**
 *
 * @param {string} srcFileNameOrPath
 * @param {string} tsDir
 */
async function resolveSrcFile(srcFileNameOrPath, tsDir) {
    if (existsSync(srcFileNameOrPath)) return srcFileNameOrPath;
    const resolved = resolve(srcFileNameOrPath);
    if (existsSync(resolved)) return resolved;

    const sourcePath = await glob(join(tsDir, '**', srcFileNameOrPath));

    if (sourcePath.length === 0) {
        console.error(
            chalk.red(
                `Source file ${srcFileNameOrPath} could not be resolved. ` +
                    `Provide an absolute path to the source file or a valid filename.`
            )
        );
        exit();
    }

    if (sourcePath.length > 1) {
        console.error(
            chalk.red(
                `Multiple files matching name ${srcFileNameOrPath} were found in the ` +
                    `out directory. Provide an absolute path to the source file.`
            )
        );
        exit();
    }

    return sourcePath[0];
}

/**
 * @param {string} outPath
 * @param {string} outFile
 */
async function resolveOutFile(outPath, outFile) {
    const matches = await glob(join(outPath, '**/' + outFile + '.js'));
    if (matches.length === 0) {
        throw new Error(`Compiled file could not be resolved.`);
    }
    if (matches.length > 1) {
        throw new Error(
            `Multiple files in the out directory that match the name ${outFile}.`
        );
    }
    return matches[0];
}

/**
 * @param {string} data
 */
function formatTscMessage(data) {
    if (/error TS/.test(data)) {
        console.error(chalk.red(data.trim()));
        return false;
    }

    if (/(Starting compilation)|(File change detected)/i.test(data)) {
        console.clear();
        console.log(formatTsMsg(data.trim(), chalk.blue) + '\n');
        return false;
    }

    if (/Found 0 errors/.test(data)) {
        console.log(formatTsMsg(data.trim(), chalk.green) + '\n');
        return true;
    }

    if (/Found \d{1,} errors/i.test(data)) {
        console.error(formatTsMsg(data.trim(), chalk.red) + '\n');
        return false;
    }

    if (data.trim().length > 0) {
        console.log(data);
    }

    return false;
}

/**
 * @param {string} msg
 * @param {import('chalk').ChalkInstance} color
 */
function formatTsMsg(msg, color) {
    if (/\d{1,2}:\d{2}:\d{2}/.test(msg)) {
        const [timestamp, message] = msg.split('-');
        return (
            chalk.gray(`[${timestamp.trim()}]`) + ' ' + color(message.trim())
        );
    }

    return color(msg);
}
