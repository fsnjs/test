import { isTruthy } from '@fsnjs/truthy';
import { Observable, isObservable, of, catchError, map } from 'rxjs';
import { isNativeError, isPromise } from 'util/types';
import chalk from 'chalk';

import { JustCallback } from './fsntest.js';

export declare interface ExecResult {
    name: string;
    passed: string;
    errorStr?: string;
}

function isExecResult(val: any): val is ExecResult {
    return (
        isTruthy(val) &&
        typeof val === 'object' &&
        'name' in val &&
        'passed' in val
    );
}

/**
 * Executes a `JustCallback`, formatting and printing an errors.
 * @param name The name of a test
 * @param callback A test function
 * @returns An object that includes the test name
 * and a field `passed` that is true if the test passed
 * and false if it failed.
 */
export function executeJustCallback(
    name: string,
    callback: JustCallback | undefined
): Observable<ExecResult> {
    const pass: ExecResult = { name, passed: chalk.green('✔') };
    const fail: ExecResult = { name, passed: chalk.red('✖') };

    if (!callback) return of({ name, passed: chalk.green('✔') });

    try {
        const result = callback();

        if (isPromise(result)) {
            return new Observable<ExecResult>((subscriber) => {
                result
                    .then(() => {
                        subscriber.next(pass);
                        subscriber.complete();
                    })
                    .catch((reason) => {
                        printErrorDetails(name, reason);
                        fail.errorStr = printErrorDetails(name, reason);
                        subscriber.next(fail);
                        subscriber.complete();
                    });
            });
        }

        if (isObservable(result)) {
            return result.pipe(
                catchError((error) => {
                    printErrorDetails(name, error);
                    fail.errorStr = printErrorDetails(name, error);
                    return of(fail);
                }),
                map((value) => {
                    if (isExecResult(value)) return value;
                    return fail;
                })
            );
        }

        return of(pass);
    } catch (e) {
        fail.errorStr = printErrorDetails(name, e);
        return of(fail);
    }
}

/**
 * Formats errors thrown by test functions.
 * @param name A test name
 * @param error An error thrown by a test
 */
export function printErrorDetails(name: string, error: unknown) {
    const err: string[] = [chalk.red(`"${name}" failed.`)];

    if (!isTruthy(error)) {
        err.push(chalk.red('An unknown error occured.'));
        return err.join('\n');
    }

    if (isNativeError(error)) {
        const { stack } = error;
        if (stack) {
            err.push(chalk.gray('\nDetails:\n'));
            err.push(stack);
        }
        return err.join('\n');
    }

    if (typeof error === 'string') {
        err.push(chalk.red(error));
        return err.join('\n');
    }

    if (typeof error === 'object') {
        err.push(
            chalk.gray('Could not parse error:'),
            JSON.stringify(error, null, 4)
        );
        return err.join('\n');
    }

    err.push(chalk.red('An unknown error occured.'));
    return err.join('\n');
}
