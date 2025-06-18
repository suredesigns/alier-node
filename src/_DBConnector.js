/*
Copyright 2024 Suredesigns Corp.

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

/**
 * Formats a SQL statement.
 * 
 * This function can be used as a tag function for template literals.
 * 
 * @param {string[]} strings 
 * An array of strings in the given template literal.
 * 
 * @param  {...any} replacements 
 * An array of the given replacements.
 * 
 * A number of replacements is always the same as the number of strings
 * plus one.
 * 
 * @returns {string}
 * A formatted SQL statement.
 * 
 * @throws {SyntaxError}
 * When
 * 
 * -    block comment is not terminated
 */
function sql(strings, ...replacements) {
    //  strings.length === replacements.length + 1
    let original_text = strings[0];
    for (const i of replacements.keys()) {
      	const replacement = String(replacements[i]);
        original_text += replacement + strings[i + 1];
    }

    let formatted_text = "";
    const matcher = new RegExp([
        String.raw`(?<comment_block_begin>\/\*)`,
        String.raw`(?<comment_block_end>\*\/)`,
        String.raw`(?<comment_line_begin>--)`,
        String.raw`(?<quoted_identifier>"(?:""|[^"])*")`,
        String.raw`(?<string_literal>'(?:''|[^'])*')`,
        String.raw`(?<whitespace>[\x20\t]+)`,
        String.raw`(?<eol>[\r\n]+|$)`
    ].join("|"), "g");

    const CODE          = 0;
    const COMMENT_LINE  = 1;
    const COMMENT_BLOCK = 2;
    /**
     * @type { CODE | COMMENT_LINE | COMMENT_BLOCK }
     */
    let state = CODE;
    let last_index = 0;
    /**
     * Index of beginning of a comment block on the original text.
     * This is used for providing debugging information.
     * @type {number}
     */
    let comment_block_index      = -1;
    /**
     * Column number of the beginning of a comment block on the
     * original text.
     * This is used for providing debugging information.
     * @type {number}
     */
    let comment_block_col_number  = -1;
    /**
     * Line number of the beginning of a comment block on the
     * original text.
     * This is used for providing debugging information.
     * @type {number}
     */
    let comment_block_line_number = -1;
    /**
     * Number of lines on the original text.
     * This is used for providing debugging information.
     * @type {number}
     */
    let line_number = 1;
    /**
     * Index of the last line head.
     * This is used for providing debugging information.
     * @type {number}
     */
    let last_line_head_index  = 1;
    for (const m of original_text.matchAll(matcher)) {
        /**
         * @type {({
         *      comment_block_begin?: string,
         *      comment_block_end?: string,
         *      comment_line_begin?: string,
         *      quoted_identifier?: string,
         *      string_literal?: string,
         *      whitespace?: string,
         *      eol?: string
         * })}
         */
        const {
            comment_block_begin,
            comment_block_end,
            comment_line_begin,
            quoted_identifier,
            string_literal,
            whitespace,
            eol
        } = m.groups;
        /**
         * @type {number}
         */
        const index = m.index;
        
        const token = original_text.slice(last_index, index);
        const matched = m[0];

        last_index = matched.length + index;

        //  update index of the last line head position and the line number if eol is found.
        if (eol != null && eol.length > 0) {
            last_line_head_index = last_index;
            line_number += eol.length;
        }

        switch (state) {
            case CODE: {
                {
                    //  Test whether or not there exists an unclosed (unpaired) quote symbol in the token.
                    //  If exists, throw a SyntaxError.
                    const unclosed_quote = /['"]/.exec(token);
                    if (unclosed_quote != null) {
                        const quote_ch         = unclosed_quote[0];
                        const backward_step    = (token.length - 1) - unclosed_quote.index;
                        const quote_index      = index - backward_step;
                        const quote_col_number = quote_index - last_line_head_index;
                        throw new SyntaxError(
                            `Missing end of quote (${quote_ch}): at index ${quote_index} (L${line_number}:${quote_col_number})`
                        );
                    }
                }

                formatted_text += token;

                if (comment_block_end != null) {
                    const col_number = index - last_line_head_index + 1;
                    throw new SyntaxError(
                        `Block comment closed but not opened yet: at index ${index} (L${line_number}:${col_number})`
                    );
                } else if (comment_block_begin != null) {
                    comment_block_index       = index;
                    comment_block_col_number  = index - last_line_head_index + 1;
                    comment_block_line_number = line_number;
                    state = COMMENT_BLOCK;
                } else if (comment_line_begin != null) {
                    state = COMMENT_LINE;
                } else if (quoted_identifier != null) {
                    formatted_text += quoted_identifier;
                } else if (string_literal != null) {
                    formatted_text += string_literal;
                } else if (whitespace != null || eol != null) {
                    if (formatted_text.length > 0 && !formatted_text.endsWith(" ")) {
                        formatted_text += " ";
                    }
                }
            }
            break;
            case COMMENT_LINE: {
                if (eol != null) {
                    if (formatted_text.length > 0 && !formatted_text.endsWith(" ")) {
                        formatted_text += " ";
                    }
                    state = CODE;
                }
            }
            break;
            case COMMENT_BLOCK: {
                if (comment_block_end != null) {
                    comment_block_index       = -1;
                    comment_block_col_number  = -1;
                    comment_block_line_number = -1;
                    state = CODE;
                }
            }
            break;
        }
    }
    if (state !== CODE) {
        throw new SyntaxError(
            `Block comment opened but not closed: at index ${comment_block_index} (L${comment_block_line_number}:${comment_block_col_number})`
        );
    }

    return formatted_text;
};

/**
 * Converts the given string to an SQL identifier or a sequence of
 * identifiers separated with dot (".").
 * 
 * @param {any} rawIdentifier
 * a string or a value can be converted to a string.
 * 
 * @param {boolean?} useDoubleQuote
 * A boolean indicating whether or not to use double quotes for escaping
 * identifiers.
 * This function uses double quotes if `true`, back quotes otherwise.
 * 
 * By default, double quotes are used (`true`).
 * 
 * @returns {string}
 * a string representing an SQL identifier.
 * 
 * @throws {DBError}
 * When encountering an unexpected token in the given identifier.
 * 
 */
function asSqlIdentifier(rawIdentifier, useDoubleQuote) {
    const raw_id = String(rawIdentifier);
    const use_double_quote = typeof useDoubleQuote !== "boolean" || useDoubleQuote;

    const quote         = use_double_quote ? '"' : "`";
    const escaped_quote = quote + quote;

    //  The magic number "128" in the regex comes from the default value
    //  of the identifier length limit, 128 characters.
    //  SQLite does not have such a limit; however, other RDBMSes,
    //  e.g. PostgreSQL, MySQL, and OracleDB, have the limit of identifier name length.
    //  see also:
    //  -   PostgreSQL: <https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS>
    //  -   MySQL: <https://dev.mysql.com/doc/refman/9.3/en/identifier-length.html>
    //  -   Oracle Database 23: <https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Database-Object-Names-and-Qualifiers.html>
    const expr = use_double_quote ?
        /[^".]{1,128}|\.|"(?:[^"]|""){0,128}"/g :
        /[^`.]{1,128}|\.|`(?:[^`]|``){0,128}`/g
    ;
    //  Although capital letters can be used for identifiers,
    //  PostgreSQL implicitly convert them to their lowercase equivalents for unquoted identifiers,
    //  hence identifiers including capital letters should also be quoted.
    const unquoted_token_expr = /^[_a-z][_a-z0-9]*$/;

    let last_index   = 0;
    let dot_expected = false;
    const tokens = [];
    for (const m of raw_id.matchAll(expr)) {
        const token = m[0];
        const index = m.index;
        const next_index = index + token.length;
        if (last_index !== index) {
            const last_token = tokens.length > 0 ? tokens[tokens.length - 1] : "";
            throw new DBError(`Syntax error: unexpected token: ${last_token + raw_id.slice(last_index, next_index)}`);
        } else if (dot_expected !== (token === ".")) {
            const last_token = tokens.length > 0 ? tokens[tokens.length - 1] : "";
            throw new DBError(`Syntax error: unexpected token: ${last_token + raw_id.slice(last_index, next_index)}`);
        }

        dot_expected = !dot_expected;

        //  For avoiding to cause degeneracy, do not test whether or not
        //  the given identifier is a valid quoted identifier here.
        if (token === "." || unquoted_token_expr.test(token)) {
            tokens.push(token);
        } else {
            const quoted_token = quote + token.replaceAll(quote, escaped_quote) + quote;
            tokens.push(quoted_token);
        }
        last_index = next_index;
    }

    //  Because tokens may contain "."s, join tokens without separator.
    return tokens.join("");
}

/**
 * Converts the given value to an SQL string literal.
 * 
 * @param {any} rawString
 * a string or a value can be converted to a string.
 * 
 * @param {boolean?} useSingleQuote
 * A boolean indicating whether or not to use back quotes for string 
 * literals.
 * This function uses single quotes if `true`, double quotes otherwise.
 * 
 * By default, single quotes are used (`true`).
 * 
 * @returns {string}
 * a string representing an SQL string literal.
 */
function asSqlString(rawString, useSingleQuote) {
    const raw_string = String(rawString);
    const use_single_quote = typeof useSingleQuote !== "boolean" || useSingleQuote;

    //  for avoiding to cause degeneracy, do not test whether or not
    //  the given string value is a valid string literal here.
    return use_single_quote ?
        `'${raw_string.replaceAll("'", "''")}'` :
        `"${raw_string.replaceAll('"', '"')}"`
    ;
}

/**
 * Converts the given data to a string representation of a value.
 * 
 * @typedef {object} AsSqlValueOptions
 * @property {boolean?} useSingleQuote
 * A boolean indicating whether or not to use back quotes for string 
 * literals.
 * This function uses single quotes if `true`, double quotes otherwise.
 * 
 * By default, single quotes are used (`true`).
 * 
 * @property {((booleanValue: boolean) => string)?} booleanReplacer
 * A function replaces the given boolean to a string.
 * 
 * If this function is not provided, booleans are converted to
 * `"TRUE"` and `"FALSE"`.
 * @param {object | string | boolean | number | bigint | undefined} rawValue 
 * Data can be treated as a value in database.
 * 
 * @param {AsSqlValueOptions?} options
 * An object containing optional parameters.
 * 
 * @returns {string}
 * A string representing the given data.
 * 
 * @throws {TypeError}
 * When
 * 
 * -    a symbol is given as data
 * -    a function is given as data
 */
function asSqlValue(rawValue, options) {
    const raw_value = rawValue;
    const use_single_quote = options?.useSingleQuote;
    const boolean_replacer = (typeof options?.booleanReplacer === "function") ?
        options?.booleanReplacer :
        boolean_value => (boolean_value ? "TRUE" : "FALSE")
    ;

    switch (typeof raw_value) {
        case "string"   : return asSqlString(raw_value, use_single_quote);
        case "boolean"  : return boolean_replacer(raw_value);
        case "number"   : return raw_value.toString(10);
        case "bigint"   : return raw_value.toString(10);
        case "object"   : return raw_value == null ? "NULL" : asSqlString(JSON.stringify(raw_value), use_single_quote);
        case "undefined": return "NULL";
        default         : throw new TypeError(`${typeof raw_value} cannot be treated as a value in database`);
    }
}

/**
 * A class for notifying generic errors caused by {@link DBConnector}.
 * 
 * "generic" means that this kind of errors must be caught in
 * application side and they should not be caught in the framework side.
 * 
 */
class DBError extends Error {}

/**
 * A class for notifying internal errors caused by {@link DBConnector}.
 * 
 * "internal" means that this kind of errors should not be caught in
 * application side and they must be caught in the framework side.
 * 
 * Note that `DBInternalError` is intentionally not derived from
 * {@link DBError} for avoiding to cause unexpected recovery processes.
 */
class DBInternalError extends Error {}

/**
 * A helper class for representing not-implemented errors.
 */
class _DBMethodNotImplementedError extends DBInternalError {
    /**
     * @param {function} ctor 
     * A class that causes an error.
     * 
     * @param {function} method 
     * A method that causes an error.
     */
    constructor(ctor, method) {
        super(`"${ctor.name}.${method.name}" is not implemented`);
    }
}

/**
 * A base class for objects that communicate with the database clients.
 */
class DBConnector {
    /**
     * A string representing the database associated with the connector.
     * @type {string}
     */
    database;

    /**
     * An object describing the database schema.
     * @typedef {(
     *      name: string,
     *      primaryKey: string[],
     *      indexes: {
     *          [index_name: string]: {
     *              unique: boolean,
     *              origin:
     *                  "create-index" |
     *                  "unique"       |
     *                  "primary-key"  ,
     *              [optional_property: string]: any
     *          }
     *      },
     *      columns: {
     *          [column_name: string]: {
     *              type: string,
     *              unique: boolean,
     *              nullable: boolean,
     *              defaultValue?: string | number,
     *              foreignKey?: ({
     *                  table: string,
     *                  to: string,
     *                  onUpdate:
     *                      "set-null"    |
     *                      "set-default" |
     *                      "cascade"     |
     *                      "restrict"    |
     *                      "no-action"   ,
     *                  onDelete:
     *                      "set-null"    |
     *                      "set-default" |
     *                      "cascade"     |
     *                      "restrict"    |
     *                      "no-action"
     *                  })[],
     *              [optional_property: string]: any
     *          }
     *      }
     * )} TableSchemaType
     * 
     * @typedef {({
     *      tables: TableSchemaType[]
     * })} DatabaseSchemaType
     * @type {DatabaseSchemaType?}
     */
    schema = null;
    
    /**
     * @constructor
     * 
     * Creates a new `DBConnector` instance.
     * 
     * @param {object} o
     * An object having arguments for the constructor.
     * 
     * @param {string} o.database
     * A string representing the database name associated with a
     * `DBConnector` to be created.
     * 
     * @throws {TypeError}
     * When the given database name is not a string.
     */
    constructor({ database }) {
        if (typeof database !== "string") {
            throw new TypeError("Given database name is not a string");
        }

        Object.defineProperties(this, {
            database: {
                value       : database,
                configurable: false,
                writable    : false,
                enumerable  : true
            },
            schema: {
                value       : null,
                configurable: false,
                writable    : true,
                enumerable  : true
            }
        });
    }

    /**
     * @async
     * @abstract
     * 
     * Executes the  given SQL statement.
     * 
     * @param {string} statement 
     * A string representing an SQL statement.
     * 
     * @param  {...any} params 
     * A sequence of extra parameters used with the given statement.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records?: any[],
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * The execution result.
     * 
     * The `status` property indicates whether or not the execution 
     * is succeeded. `true` if it is succeeded, `false` otherwise.
     * 
     * The `records` property representing a set of the records selected 
     * by the given query. This property is provided only when executing 
     * a `SELECT` statement.
     * 
     * The `message` property representing a human-readable information 
     * upon the error occurred while executing the given statement.
     * This property is provided only when the execution is failed.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async execute(statement, ...params) {
        throw new _DBMethodNotImplementedError(this.constructor, this.execute);
    }

    /**
     * @async
     * @abstract
     * 
     * Compiles the given statement and gets the ID for the compiled 
     * statement.
     * 
     * @param {string} statement 
     * A string representing an SQL statement to compile.
     * 
     * The statement must be either one of `SELECT`, `INSERT`, `UPDATE`,
     * or `DELETE` statement.
     * 
     * @returns {Promise<number>}
     * A `Promise` that resolves to a number representing the ID for
     * the compiled statement.
     * This number must be a positive integer.
     * 
     * The number obtained here can be used for invoking
     * {@link releasePreparedStatement()} and {@link executePreparedStatement()}.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    the given statement is invalid as an SQL statement
     * -    the given statement is neither one of `SELECT`, `INSERT`,
     *      `UPDATE`, nor `DELETE`.
     * 
     * @see
     * -    {@link releasePreparedStatement}
     * -    {@link executePreparedStatement}
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async compile(statement) {
        throw new _DBMethodNotImplementedError(this.constructor, this.compile);
    }

    /**
     * @async
     * @abstract
     * 
     * Releases the specified prepared statement. 
     * 
     * @param {number} id 
     * A number representing the ID for the prepared statement
     * to release.
     * 
     * The valid ID can be obtained from {@link compile()}.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled after releasing the statement.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    failed to release the prepared statement
     * 
     * @see
     * -    {@link compile}
     * -    {@link executePreparedStatement}
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async releasePreparedStatement(id) {
        throw new _DBMethodNotImplementedError(this.constructor, this.releasePreparedStatement);
    }

    /**
     * @async
     * @abstract
     * 
     * Executes the specified prepared statement for each set of
     * parameters. 
     * 
     * @param {number} id 
     * A number representing the ID for the prepared statement
     * to release.
     * 
     * The valid ID can be obtained from {@link compile()}.
     * 
     * @param  {...any[]} paramSets 
     * A sequence of sets of parameters used with the prepared statement.
     * 
     * @returns {Promise<any[]>}
     * A `Promise` that resolves to an array of execution results.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    failed to execute the prepared statement
     * -    the number of the given parameters exceeds the number of
     *      placeholders in the prepared statement
     * 
     * @see
     * -    {@link compile}
     * -    {@link releasePreparedStatement}
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async executePreparedStatement(id, ...paramSets) {
        throw new _DBMethodNotImplementedError(this.constructor, this.executePreparedStatement);
    }

    /**
     * @async
     * @abstract
     * 
     * Releases the underlying database client and connection pool.
     * 
     * This function invokes {@link disconnect()} if there is a client
     * connecting with the backend database before releasing the
     * connection pool.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    the client failed to disconnect from the backend server
     * -    failed to release the connection pool
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async end() {
        throw new _DBMethodNotImplementedError(this.constructor, this.end);
    }
    
    /**
     * @async
     * @abstract
     * 
     * Connects to the associated database.
     * 
     * To disconnect from the database, use {@link disconnect()} method.
     * 
     * @returns {Promise<boolean>}
     * A `Promise` that resolves to a `boolean` representing whether or
     * not the underlying client succeeds to connect to the database.
     * 
     * `true` if succeeded to connect or already connected,
     * `false` otherwise.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @see
     * -    {@link disconnect}
     *
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async connect() {
        throw new _DBMethodNotImplementedError(this.constructor, this.connect);
    }

    /**
     * @async
     * @abstract
     * 
     * Disconnects from the connected database.
     * 
     * To connect to the database, use {@link connect()} method.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled when disconnection is completed.
     * 
     * Unlike {@link connect()}, this `Promise` resolves to `void` and
     * not `boolean`.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @see
     * -    {@link connect}
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async disconnect() {
        throw new _DBMethodNotImplementedError(this.constructor, this.disconnect);
    }

    /**
     * @async
     * @abstract
     * 
     * Starts a transaction.
     * 
     * After a transaction begins, you can use the following methods:
     * 
     * -    {@link commit()} to commit database operations done during
     *      the transaction and then terminate that transaction.
     * -    {@link rollback()} to rollback the database state to
     *      the previous state at the beginning of the transaction
     *      and then terminate that transaction.
     * -    {@link putSavepoint()} to put a savepoint on the on-going
     *      transaction.
     * -    {@link rollbackTo()} to rollback the database state to
     *      the previous state at the specified savepoint on
     *      the on-going transaction.
     * 
     * @param {object} options
     * An object having optional arguments.
     * 
     * This parameter can be used to provide extra parameters, such as
     * the transaction level, for the statement used for starting a
     * new transaction specified in the underlying database.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @see
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     * 
     * ADDITIONAL NOTES ON NESTING TRANSACTIONS:
     * Many database management systems do not support nesting multiple
     * transactions explicitly, however, they provide `SAVEPOINT` and
     * `ROLLBACK TO <savepoint>` statements instead.
     * You can provide transaction nesting by using the `SAVEPOINT` 
     * functionality.
     * 
     * ADDITIONAL NOTES ON PROVIDING A TRANSACTION AS AN OBJECT:
     * In many situations, stateless interfaces are preferred rather
     * than stateful interfaces.
     * Hence it is preferred that the outermost interface for
     * the database represents a transaction as an object with
     * short lifetime rather than as an intermediate state of a database
     * client.
     * 
     * The {@link DBConnector} itself is designed as a thin wrapper of 
     * a database client and it only provides a set of very basic and 
     * primitive operations in order to adapt various database 
     * management systems.
     * 
     * Thus, you should implement an extra interface which provides 
     * safer way to manipulate the underlying database if you want.
     */
    // eslint-disable-next-line no-unused-vars
    async startTransaction(options) {
        throw new _DBMethodNotImplementedError(this.constructor, this.startTransaction);
    }
    
    /**
     * @async
     * @abstract
     * 
     * Commits the current transaction.
     * 
     * After invoking this method, the current transaction is terminated.
     * 
     * This method is only available after invoking 
     * the {@link startTransaction()}.
     * 
     * To revert operations done after the beginning of the current 
     * transaction, use {@link rollback()} method.
     * 
     * To revert operations done after the specific savepoint 
     * put on the current transaction by using {@link putSavepoint()}
     * method, use {@link rollbackTo()} method.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    transaction is not started 
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async commit() {
        throw new _DBMethodNotImplementedError(this.constructor, this.commit);
    }
    
    /**
     * @async
     * @abstract
     * 
     * Rolls back the database state to the previous state at the point
     * that the current transaction begins.
     * 
     * After invoking this method, the current transaction is terminated.
     * 
     * This method is only available after invoking 
     * the {@link startTransaction()}.
     * 
     * To commit operations done after the beginning of the current 
     * transaction, use {@link commit()} method.
     * 
     * To revert operations done after the specific savepoint 
     * put on the current transaction by using {@link putSavepoint()}
     * method, use {@link rollbackTo()} method.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented 
     * 
     * @throws {DBError}
     * When
     * -    transaction is not started 
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async rollback() {
        throw new _DBMethodNotImplementedError(this.constructor, this.rollback);
    }

    /**
     * @async
     * @abstract
     * 
     * Puts a new savepoint on the current transaction.
     * 
     * This method is only available after invoking 
     * the {@link startTransaction()}.
     * 
     * To revert operations done after the savepoint put by this method,
     * use {@link rollbackTo()} method.
     * 
     * @param {string} savepoint 
     * A string representing a new savepoint name.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    transaction is not started 
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link rollbackTo} 
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async putSavepoint(savepoint) {
        throw new _DBMethodNotImplementedError(this.constructor, this.putSavepoint);

    }

    /**
     * @async
     * @abstract
     * 
     * Rolls back the database state to the previous state at
     * the specified savepoint.
     * 
     * After invoking this method, savepoints put after the specified 
     * savepoint are invalidated.
     * 
     * This method is only available after invoking 
     * the {@link startTransaction()}.
     * 
     * To put a new savepoint on the on-going transaction,
     * use {@link putSavepoint()} method.
     * 
     * 
     * @param {string} savepoint 
     * A string representing the name of an existing savepoint on 
     * the current transaction.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When
     * -    transaction is not started 
     * -    the specified savepoint does not exist in the on-going transaction 
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async rollbackTo(savepoint) {
        throw new _DBMethodNotImplementedError(this.constructor, this.rollbackTo);
    }

    /**
     * @async
     * @abstract
     * 
     * Creates a new table from the given table schema.
     * 
     * @param {TableSchemaType} tableSchema
     * An object representing the definition of a table to be created.
     * 
     * @param {boolean} ifNotExists
     * A boolean indicating whether or not to try to create a table
     * if the table with the same name already exists.
     * `true` means that this function tries to create a table
     * only if it does not exist yet.
     * `false` means that this function tries to create a table
     * regardless of its existence.
     * 
     * @returns {Promise<TableSchemaType>}
     * A `Promise` that resolves to an object representing the created
     * table schema.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When failed to create a table.
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async createTable(tableSchema, ifNotExists) {
        throw new _DBMethodNotImplementedError(this.constructor, this.createTable);
    }

    /**
     * @async
     * @abstract
     * 
     * Drops the specified table if exists.
     * 
     * @param {string} tableName 
     * A string representing the table to be dropped.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled when the process is completed.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * @throws {DBError}
     * When failed to drop the specified table.
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    async dropTable(tableName) {
        throw new _DBMethodNotImplementedError(this.constructor, this.dropTable);
    }

    /**
     * @async
     * @abstract
     * 
     * Gets an object describing the database schema.
     * 
     * @returns {Promise<DatabaseSchemaType>}
     * A `Promise` that resolves to an object describing the database schema.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    async getSchema() {
        throw new _DBMethodNotImplementedError(this.constructor, this.getSchema);
    }

    /**
     * @abstract
     * Replaces placeholder symbols in the given query string to
     * the appropriate symbols.
     * 
     * @param {string} query 
     * A string representing the query to be replaced.
     * 
     * @returns {string}
     * The replaced query string.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    fixPreparedStatementQuery(query) {
        throw new _DBMethodNotImplementedError(this.constructor, this.fixPreparedStatementQuery);
    }

    /**
     * @abstract
     * Escapes the given string as an SQL identifier.
     * 
     * @param {string} rawIdentifier 
     * A string to escape as an SQL identifier.
     * 
     * @returns {string}
     * An SQL identifier.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    asIdentifier(rawIdentifier) {
        throw new _DBMethodNotImplementedError(this.constructor, this.asIdentifier);
    }

    /**
     * @abstract
     * Escapes the given string as an SQL string literal.
     * 
     * @param {string} rawIdentifier 
     * A string to escape as an SQL string literal.
     * 
     * @returns {string}
     * An SQL string literal.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    asString(rawString) {
        throw new _DBMethodNotImplementedError(this.constructor, this.asString);
    }

    /**
     * @abstract
     * Converts the given data to an SQL value literal.
     * 
     * @param { object | string | boolean | number | bigint | undefined } rawValue 
     * A value to convert to an SQL value literal.
     * 
     * @returns {string}
     * An SQL value literal.
     * 
     * @throws {DBInternalError}
     * When
     * -    the invoked method is not implemented
     * 
     * NOTE:
     * This method is abstract, say it means the {@link DBConnector} 
     * itself has no implementation for the method.
     * Hence, you, the implementer, should ensure that your
     * implementation conforms to the requirements described here.
     */
    // eslint-disable-next-line no-unused-vars
    asValue(rawValue) {
        throw new _DBMethodNotImplementedError(this.constructor, this.asValue);
    }
}

module.exports = {
    DBConnector,
    DBError,
    DBInternalError,
    sql,
    asSqlIdentifier,
    asSqlString,
    asSqlValue
};
