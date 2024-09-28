import chalk from 'chalk';
import { diffChars } from 'diff';
import { isTruthy, isFalsy } from '@fsnjs/truthy';

const blue = chalk.blue;

export function expect(expected: any) {
    return {
        isTruthy: () => {
            if (isTruthy(expected)) return true;
            throw new Error(
                `Expected value to be truthy, received ${blue(expected)}.`
            );
        },
        isFalsy: () => {
            if (isFalsy(expected)) return true;
            throw new Error(
                `Expected value to be falsy, received ${blue(expected)}.`
            );
        },
        toEqual: (received: any) => {
            if (expected === received) return true;

            let diffed = '';

            if (typeof expected === 'string') {
                diffed =
                    `\n\n${chalk.gray('Diff:')}\n` +
                    diffChars(expected, received)
                        .map((change) => {
                            if (change.added) {
                                if (change.value === ' ') change.value = '_';
                                return chalk.green(change.value);
                            }
                            if (change.removed) {
                                if (change.value === ' ') change.value = '_';
                                return chalk.red(change.value);
                            }
                            return change.value;
                        })
                        .join('') +
                    '\n\n';
            }

            if (typeof expected === 'number') {
                diffed = `\n\n${chalk.gray('Details:')}\n\n${chalk.red(expected + ' !== ' + received)}\n`;
            }

            throw new Error(
                `Expected value ${chalk.bold('does not equal')} received value.${diffed}`
            );
        },
        toNotEqual: (received: any) => {
            if (expected !== received) return true;
            throw new Error(
                `Expected value (${blue(expected)}) ${chalk.bold('equals')} received value (${blue(received)}).`
            );
        },
        toThrow: () => {
            if (typeof expected !== 'function') {
                throw new Error(
                    `Expected a function, received ${blue(typeof expected)}.`
                );
            }

            try {
                expected();
                throw new Error(
                    `Expected function ${blue(expected)} to throw an error, but it did not.`
                );
            } catch (e) {
                return true;
            }
        }
    };
}
