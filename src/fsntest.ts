import chalk from 'chalk';
import { concatMap, last, map, Observable, of, scan } from 'rxjs';
import { ExecResult, executeJustCallback } from './execute.js';
import { Table } from 'console-table-printer';
import ora from 'ora';

export declare type JustCallback = () => void | Promise<any> | Observable<any>;

let beforeAllFn: JustCallback | undefined;
let beforeEachFn: JustCallback | undefined;

let afterAllFn: JustCallback | undefined;
let afterEachFn: JustCallback | undefined;

const tests: Record<string, JustCallback> = {};

export async function describe(suiteName: string, testDef: () => void) {
    console.log(chalk.blue(`Executing ${suiteName}\n`));
    testDef();

    const executeTests = of(...Object.entries(tests)).pipe(
        concatMap((test) =>
            executeJustCallback('beforeEach', beforeEachFn).pipe(
                map(() => test)
            )
        ),
        concatMap(([name, testFn]) => {
            const spinner = ora(`Executing "${name}"...`);

            const start = new Date();
            return executeJustCallback(name, testFn).pipe(
                concatMap((testResult) => {
                    let time: string;
                    let _timing = dateToMs(new Date()) - dateToMs(start);

                    if (_timing) {
                        let [whole, decimal] = `${_timing}`.split('.');
                        decimal ??= '000';
                        time = whole + '.' + decimal.slice(0, 3);
                    } else {
                        time = '0.000';
                    }

                    if (testResult.passed === chalk.green('✔')) {
                        spinner.succeed(
                            chalk.green(`"${name}" passed in ${time}s.`)
                        );
                    } else {
                        spinner.fail(
                            testResult.errorStr ?? `"${name}" failed.`
                        );
                    }

                    return executeJustCallback('afterEach', afterEachFn).pipe(
                        map(() => ({
                            ...testResult,
                            timing: time
                        }))
                    );
                })
            );
        }),

        scan(
            (acc, result) => {
                acc.push(result);
                return acc;
            },
            <(ExecResult & { timing: string })[]>[]
        ),
        last()
    );

    executeJustCallback('beforeAll', beforeAllFn)
        .pipe(
            concatMap(() => executeTests),
            concatMap((result) =>
                executeJustCallback('afterAll', afterAllFn).pipe(
                    map(() => result)
                )
            )
        )
        .subscribe((summary) => {
            console.log(chalk.blue('\n\nSummary:\n'));

            new Table({
                columns: [
                    {
                        name: 'passed',
                        title: 'Pass',
                        alignment: 'center'
                    },
                    {
                        name: 'name',
                        title: 'Test Name',
                        alignment: 'left'
                    },
                    {
                        name: 'timing',
                        title: 'Time',
                        color: 'green'
                    }
                ],
                rows: summary.map(({ name, passed, timing }) => ({
                    name,
                    passed,
                    timing
                }))
            }).printTable();
        });
}

function dateToMs(date: Date) {
    const seconds =
        date.getHours() * 60 * 60 + date.getMinutes() * 60 + date.getSeconds();
    const ms = date.getMilliseconds() / 1000;
    return seconds + ms;
}

export function beforeAll(fn: JustCallback) {
    beforeAllFn = fn;
}
export function beforeEach(fn: JustCallback) {
    beforeEachFn = fn;
}

export function afterAll(fn: JustCallback) {
    afterAllFn = fn;
}
export function afterEach(fn: JustCallback) {
    afterEachFn = fn;
}

export function it(testDescription: string, testExec: JustCallback) {
    tests[testDescription] = testExec;
}

export { expect } from './expect.js';
