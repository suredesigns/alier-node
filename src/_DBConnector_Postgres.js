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

const { sql, DBConnector, DBError, asSqlIdentifier, asSqlString, asSqlValue } = require("./_DBConnector.js");
const { Client, Pool } = require("pg");

/**
 * @typedef {(
 *      "set-null"    |
 *      "set-default" |
 *      "cascade"     |
 *      "restrict"    |
 *      "no-action"
 * )} ActionType
 * Actions triggered when foreign keys are modified (updated or deleted).
 * 
 * @typedef {({
 *      table: string,
 *      to: string,
 *      onUpdate: ActionType,
 *      onDelete: ActionType
 * })} ForeignKeyType
 * Objects representing descriptions of foreign key references.
 * 
 * @typedef {(ForeignKeyType | ForeignKeyType[]) } InputForeignKeyType
 * Loosely typed version of {@link ForeignKeyType}.
 * 
 * @typedef {({
 *      type: string,
 *      unique: boolean,
 *      nullable: boolean,
 *      defaultValue?: string | number,
 *      foreignKey?: ForeignKeyType
 * })} ColumnDescriptorType
 * Objects representing descriptions of columns of database tables.
 * 
 * @typedef {(string | ColumnDescriptorType | {
 *      type: string,
 *      unique: boolean,
 *      nullable: boolean,
 *      defaultValue?: string | number,
 *      foreignKey?: InputForeignKeyType
 * })} InputColumnDescriptorType
 * Loosely typed version of {@link ColumnDescriptorType}.
 *
 * @typedef {(
 *      "create-index" |
 *      "unique"       |
 *      "primary-key"
 * )} IndexOriginType
 * Origins of database indexes.
 * 
 * @typedef {({
 *      unique: boolean,
 *      origin: IndexOriginType,
 *      partial: boolean
 * })} IndexDescriptorType
 * Objects representing descriptions of database indexes.
 * 
 * @typedef {({
 *      name: string,
 *      primaryKey?: string[],
 *      indexes?: {
 *          [index_name: string]: IndexDescriptorType
 *      },
 *      columns: {
 *          [column_name: string]: ColumnDescriptorType
 *      }
 * })} TableSchemaType
 * Objects representing database table schemata.
 *  
 * @typedef {({
 *      name: string,
 *      primaryKey?    : string | string[],
 *      primarykey?    : string | string[],
 *      primary_key?   : string | string[],
 *      "primary-key"? : string | string[],
 *      indexes?: {
 *          [index_name: string]: IndexDescriptorType
 *      },
 *      columns: {
 *          [column_name: string]: InputColumnDescriptorType
 *      }
 * })} InputTableSchemaType 
 * Loosely typed version of {@link TableSchemaType}.
 * 
 * @typedef {(
 *  "serializable"     |
 *  "repeatable-read"  |
 *  "read-committed"   |
 *  "read-uncommitted"
 * )} IsolationLevelType
 * Isolation levels of transactions.
 */

/**
 * Isolation levels of transactions.
 * @enum {IsolationLevelType}
 */
const IsolationLevel = Object.freeze({
    SERIALIZABLE    : "serializable",
    REPEATABLE_READ : "repeatable-read",
    READ_COMMITTED  : "read-committed",
    READ_UNCOMMITTED: "read-uncommitted"
});

class PostgreSQLConnector extends DBConnector {
    /**
     * Isolation levels of transactions.
     */
    static IsolationLevel = IsolationLevel;

    /**
     * A PostgreSQL client pool
     * @type {Pool?}
     */
    #pool = null;
    /**
     * A PostgreSQL client
     * @type {Client | import("pg").PoolClient ?}
     */
    #client = null;
    /**
     * @type {import("pg").PoolConfig?}
     */
    #client_config = null;
    /**
     * A callback function invoked whenever a connection encounters an error.
     * 
     * @type {((error: Error, client: Client) => void)?}
     */
    #on_error = null;
    /**
     * A callback function invoked whenever a connection becomes available.
     * 
     * @type {((client: Client) => void)?}
     */
    #on_connect = null;
    /**
     * A callback function invoked whenever a connection is released.
     * 
     * @type {((client: Client) => void)?}
     */
    #on_disconnect = null;

    /**
     * @constructor
     * 
     * Creates a new instance of {@link PostgreSQLConnector}.
     * 
     * @param {object} o 
     * An object containing configuration options.
     * 
     * This object is a compound of {@link https://node-postgres.com/apis/pool#new-pool| PoolConfig} defined in node-postgres
     * and some additional arguments.
     * 
     * @param {boolean?} o.usePool
     * An optional boolean indicating whether or not to use connection
     * pooling.
     * `true` when using connection pooling, `false` otherwise.
     * 
     * By default, connection pooling is not used (`false`).
     * 
     * @param {((error: Error, client: import("pg").Client) => void)?} o.onError
     * A callback function invoked whenever a connection encounters an error.
     * 
     * @param {((client: import("pg").Client) => void)?} o.onConnect
     * A callback function invoked whenever a connection becomes available.
     * 
     * This function is invoked when {@link connect()} method is 
     * invoked with the instance newly created.
     * 
     * @param {((client: import("pg").Client) => void)?} o.onDisconnect
     * A callback function invoked whenever a connection is released.
     * 
     * This function is invoked when {@link disconnect()} method is 
     * invoked with the instance newly created.
     * 
     * @throws {TypeError}
     * When
     * -    database name is not specified
     * -    a value not being a function is given as `onError`
     * -    a value not being a function is given as `onConnect`
     * -    a value not being a function is given as `onDisconnect`
     */
    constructor(o) {
        super({ database: o?.database });

        const o_ = o ?? {};

        const {
            usePool     : use_pool,
            onError     : on_error,
            onConnect   : on_connect,
            onDisconnect: on_disconnect,
            ...config
        } = o_;

        if (on_error != null && typeof on_error !== "function") {
            throw new TypeError("'onError' is not a function");
        } else if (on_connect != null && typeof on_connect !== "function") {
            throw new TypeError("'onConnect' is not a function");
        } else if (on_disconnect != null && typeof on_disconnect !== "function") {
            throw new TypeError("'onDisconnect' is not a function");
        }

        const use_pool_ = typeof use_pool === "boolean" ? use_pool : false;

        if (use_pool_) {
            const pool = new Pool(config);

            if (on_error != null) {
                pool.on("error", on_error);
            }
            if (on_connect != null) {
                pool.on("connect", on_connect);
            }
            if (on_disconnect != null) {
                pool.on("release", on_disconnect);
            }

            this.#pool = pool;
        } else {
            this.#client_config = config;

            if (on_error != null) {
                this.#on_error = on_error;
            }
            if (on_connect != null) {
                this.#on_connect = on_connect;
            }
            if (on_disconnect != null) {
                this.#on_disconnect = on_disconnect;
            }
        }
    }

    /**
     * @async
     * @override
     * 
     * Releases the underlying database client and connection pool.
     * 
     * This function invokes {@link disconnect()} if there is a client
     * connecting with the backend PostgreSQL server before releasing
     * connection pool.
     * 
     * @throws {DBError}
     * When
     * -    the client failed to disconnect from the backend server
     * -    failed to release the connection pool
     */
    async end() {
        if (this.#client != null) {
            await this.disconnect();
        }
        const pool = this.#pool;
        this.#pool = null;
        if (pool != null) {
            try {
                await pool.end();
            } catch(error) {
                throw new DBError(error.message, { cause: error });
            }
        }
    }

    /**
     * Executes the  given SQL statement.
     * 
     * @async
     * @override
     * 
     * @param {string} statement 
     * A string representing an SQL statement.
     * 
     * @param  {...any} params 
     * A sequence of extra parameters used with the given statement.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records?: any[]
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
     */
    async execute(statement, ...params) {
        if (this.#client == null) {
            return {
                status: false,
                message: "Connection not established"
            };
        }
        try {
            const { rows: records } = await this.#client.query({
                text: statement,
                values: params
            });
            return {
                status: true,
                records
            };
        } catch(e) {
            console.error(e);
            const message = e?.message;
            return message == null ? {
                status: false
            } : {
                status : false,
                message: message
            };
        }
    }

    /**
     * @async
     * @override
     * 
     * Connects to the associated database.
     * 
     * To disconnect from the database, use {@link disconnect()} method.
     * 
     * If the target `PostgreSQLConnector` uses connection pooling,
     * connection is established with the pooled client.
     * Otherwise, this function creates a new standalone client and then
     * tries to connect to the backend PostgreSQL server by using it.
     * 
     * This function triggers the `onConnected()` callback passed to
     * the {@link constructor()}.
     * 
     * @returns {Promise<boolean>}
     * A `Promise` that resolves to a `boolean` representing whether or
     * not the underlying client succeeds to connect to the database.
     * 
     * `true` if succeeded to connect or already connected,
     * `false` otherwise.
     * 
     * @see
     * -    {@link disconnect}
     */
    async connect() {
        if (this.#client != null) { return true; }
        try {
            if (this.#pool == null) {
                const client = new Client(this.#client_config);

                const on_error  = this.#on_error;
                if (on_error != null) {
                    client.on("error", (error) => {
                        on_error(error, client);
                    });
                }

                const on_disconnect = this.#on_disconnect;
                if (on_disconnect != null) {
                    client.on("end", () => {
                        on_disconnect(client);
                    });
                }

                await client.connect();

                const on_connect = this.#on_connect;
                if (on_connect != null) {
                    on_connect(client);
                }

                this.#client = client;
            } else {
                const client = await this.#pool.connect();
                this.#client = client;
            }
            return true;
        } catch(e) {
            console.error(e);
            return false;
        }
    }

    /**
     * @async
     * @override
     * 
     * Disconnects from the connected database.
     * 
     * To connect to the database, use {@link connect()} method.
     * 
     * This function releases the underlying client if it comes from
     * the connection pool by using `release()` method.
     * Otherwise, `end()` method is invoked with the client.
     * 
     * This function triggers the `onDisconnected()` callback passed to
     * the {@link constructor()}.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled when disconnection is completed.
     * 
     * Unlike {@link connect()}, this `Promise` resolves to `void` and
     * not `boolean`.
     * 
     * @throws {DBError}
     * When
     * -    the underlying client failed to disconnect from the PostgreSQL server
     * -    failed to release the underlying pooled client
     * 
     * @see
     * -    {@link connect}
     */
    async disconnect() {
        const client = this.#client;

        if (client == null) { return; }

        this.#client = null;
        try {
            if (this.#pool != null && typeof client.release === "function") {
                await client.release();
            } else {
                await client.end();
            }
        } catch (error) {
            throw new DBError(error.message, { cause: error });
        }
    }

    /**
     * @async
     * @override
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
     * @param {IsolationLevelType?} options.isolationLevel
     * A string representing isolation level of a transaction.
     * 
     * By default, the transaction starts with `READ COMMITTED`.
     * 
     * @param {boolean?} options.readonly
     * A boolean indicating whether or not a transaction starts with
     * read only mode.
     * `true` if the transaction starts with `READ ONLY` mode,
     * `false` if the transaction starts with `READ WRITE` mode.
     * 
     * By default, the transaction starts with `READ WRITE` mode.
     * 
     * @param {boolean?} options.deferrable
     * A boolean indicating whether or not a transaction starts with
     * deferrable mode.
     * `true` if the transaction starts with `deferrable` mode,
     * `false` if the transaction starts with `NOT DEFERRABLE` mode.
     * 
     * By default, the transaction starts with `NOT DEFERRABLE` mode.
     * 
     * Note that `DEFERRABLE` should be used with `READ ONLY` and
     * `ISOLATION LEVEL SERIALIZABLE` keywords.
     * In other transaction modes, `DEFERRABLE` has no effects.
     * 
     * @throws {DBError}
     * When an error occurs during executing `START TRANSACTION` command.
     * 
     * @see
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     */
    async startTransaction(options) {
        const isolation_level = options?.isolationLevel;
        const isolation_level_ = (
            typeof isolation_level === "string" && (
                isolation_level === IsolationLevel.SERIALIZABLE     ||
                isolation_level === IsolationLevel.REPEATABLE_READ  ||
                isolation_level === IsolationLevel.READ_COMMITTED   ||
                isolation_level === IsolationLevel.READ_UNCOMMITTED
            )
        ) ?
            isolation_level :
            IsolationLevel.READ_COMMITTED
        ;
        const readonly = options?.readonly;
        const readonly_ = typeof readonly === "boolean" ? readonly : false;
        const deferrable = options?.deferrable;
        const deferrable_ = (
            readonly_ &&
            isolation_level_ === IsolationLevel.SERIALIZABLE &&
            typeof deferrable === "boolean"
        ) ? 
            deferrable :
            false
        ;

        const transaction_modes = [];
        transaction_modes.push(
            isolation_level_ === IsolationLevel.SERIALIZABLE    ?
                "ISOLATION LEVEL SERIALIZABLE"     :
            isolation_level_ === IsolationLevel.REPEATABLE_READ ?
                "ISOLATION LEVEL REPEATABLE READ"  :
            isolation_level_ === IsolationLevel.READ_COMMITTED  ?
                "ISOLATION LEVEL READ COMMITTED"   :
                "ISOLATION LEVEL READ UNCOMMITTED"
        );
        transaction_modes.push(readonly_   ? "READ ONLY"  : "READ WRITE");
        transaction_modes.push(deferrable_ ? "DEFERRABLE" : "NOT DEFERRABLE");

        const result = await this.execute(sql`START TRANSACTION ${transaction_modes.join(",")};`);
        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    /**
     * @async
     * @override
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
     * @throws {DBError}
     * When an error occurs during executing `COMMIT` command.
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     */
    async commit() {
        const result = await this.execute("COMMIT;");
        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    /**
     * @async
     * @override
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
     * @throws {DBError}
     * When an error occurs during executing `ROLLBACK` command.
     *  
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link putSavepoint} 
     * -    {@link rollbackTo} 
     */
    async rollback() {
        const result = await this.execute("ROLLBACK;");
        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    /**
     * @async
     * @override
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
     * @throws {DBError}
     * When an error occurs during executing `SAVEPOINT` command.
     *  
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link rollbackTo} 
     */
    async putSavepoint(savepoint) {
        const savepoint_ = String(savepoint);
        const result = await this.execute(sql`SAVEPOINT ${this.asIdentifier(savepoint_)};`);
        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    /**
     * @async
     * @override
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
     * @throws {DBError}
     * When an error occurs during executing `ROLLBACK TO SAVEPOINT` command.
     * 
     * @see
     * -    {@link startTransaction} 
     * -    {@link commit} 
     * -    {@link rollback} 
     * -    {@link putSavepoint} 
     * 
     */
    async rollbackTo(savepoint) {
        const savepoint_ = String(savepoint);
        const result = await this.execute(sql`ROLLBACK TO ${this.asIdentifier(savepoint_)};`);
        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    /**
     * @async
     * @override
     * 
     * Creates a new table from the given table schema.
     * 
     * @param {InputTableSchemaType} tableSchema 
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
     * @throws {DBError}
     * When failed to create a table.
     */
    async createTable(tableSchema, ifNotExists) {
        const if_not_exists = Boolean(ifNotExists);

        const table_schema = tableSchema;
        if (table_schema === null || typeof table_schema !== "object") {
            throw new TypeError("Table schema is not a non-null object");
        }

        const table_name = table_schema?.name;
        if (typeof table_name !== "string") {
            throw new TypeError("Given schema's 'name' property is not a string");
        }

        let primary_key = (
            table_schema.primaryKey     ??
            table_schema.primarykey     ??
            table_schema.primary_key    ??
            table_schema["primary-key"] ??
            []
        );
        if (typeof primary_key === "string") {
            primary_key = primary_key.split(",").map(key => key.trim()).filter(key => key.length > 0);
        }
        const primary_key_ = primary_key;
        if (!Array.isArray(primary_key_) || primary_key_.some(x => typeof x !== "string")) {
            //  Array.prototype.some() always returns false for empty arrays.
            throw new TypeError("Given schema's 'primaryKey' property is not a string array");
        }

        //  To make a copy of the columns object after type checking,
        //  let columns a let variable.
        let columns = table_schema.columns;
        if (columns === null || typeof columns !== "object") {
            throw new TypeError("Given schema's 'columns' property is not a non-null object");
        }

        //  Make a copy of the column descriptor.
        columns = {...columns};

        //  Normalize the given column descriptor.
        for (const column_name of Object.keys(columns)) {
            const column  = columns[column_name];
            if (typeof column === "string") {
                columns[column_name] = { type: column };
            } else {
                columns[column_name] = { ...column };
                
                const foreign_key = column.foreignKey;
                if (Array.isArray(foreign_key)) {
                    if (foreign_key.length > 0) {
                        column.foreignKey = { ...(foreign_key[0]) };
                    } else {
                        delete column.foreignKey;
                    }
                } else if (foreign_key != null) {
                    column.foreignKey = { ...foreign_key };
                }
            }
        }

        /** @type {{ [column_name: string]: ColumnDescriptorType }} */
        const columns_ = columns;

        const column_specs      = [];
        const table_constraints = [];

        for (const column_name of Object.keys(columns_)) {
            const column  = columns_[column_name];

            /** @type {string[]} */
            const column_constraints = [];

            const unique = column.unique ?? false;
            if (unique && !primary_key_.includes(column_name)) {
                //  Because every primary key is implicitly unique,
                //  there is no need for applying UNIQUE constraint to it.

                /// TODO: Consider to support conflict-clause
                column_constraints.push("UNIQUE");
            } 

            const not_null = !(column.nullable ?? true);
            if (not_null) {
                /// TODO: Consider to support conflict-clause
                column_constraints.push("NOT NULL");
            } 

            const default_value = column.defaultValue;
            if (default_value != null) {
                column_constraints.push(`DEFAULT ${this.asValue(default_value)}`)
            }

            const foreign_key = column.foreignKey;
            const map_action = (action) => {
                switch (action) {
                    case "set-null"   : return "SET NULL"   ;
                    case "set-default": return "SET DEFAULT";
                    case "cascade"    : return "CASCADE"    ;
                    case "restrict"   : return "RESTRICT"   ;
                    case "no-action"  : return "NO ACTION"  ;
                }
            };
            if (foreign_key != null) {
                const { table, to, onUpdate: on_update, onDelete: on_delete } = foreign_key;
                if (typeof table !== "string") {
                    throw new TypeError(`Column ${column_name}: Foreign table is not specified`);
                } else if (typeof to !== "string") {
                    throw new TypeError(`Column ${column_name}: Column name of the foreign table (${table}) is not specified`);
                } else if (on_update != null && typeof on_update !== "string") {
                    throw new TypeError(`Column ${column_name}: Unexpected value is set as ON UPDATE action for the foreign key "${table}.${to}"`);
                } else if (on_delete != null && typeof on_delete !== "string") {
                    throw new TypeError(`Column ${column_name}: Unexpected value is set as ON DELETE action for the foreign key "${table}.${to}"`);
                }

                const on_update_ = map_action(on_update ?? "no-action");
                if (on_update_ == null) {
                    throw new TypeError(`Column ${column_name}: Unknown action is set as ON UPDATE action: ${on_update}`);
                }

                const on_delete_ = map_action(on_delete ?? "no-action");
                if (on_delete_ == null) {
                    throw new TypeError(`Column ${column_name}: Unknown action is set as ON DELETE action: ${on_delete}`);
                }

                let fk_clause = `REFERENCES ${this.asIdentifier(table)}(${this.asIdentifier(to)})`;
                if (on_update_ !== "NO ACTION") {
                    fk_clause += " " + `ON UPDATE ${on_update_}`;
                }
                if (on_delete_ !== "NO ACTION") {
                    fk_clause += " " + `ON DELETE ${on_delete_}`;
                }

                column_constraints.push(fk_clause);
            }
            column_specs.push(
                `${column_name} ${column.type} ${column_constraints.join(" ")}`
            );
        }

        table_constraints.push(`PRIMARY KEY (${primary_key_.map(x => this.asIdentifier(x)).join(",")})`);

        const table_specs    = [...column_specs, ...table_constraints ]; 

        const result = await this.execute(sql`
            ${if_not_exists ? "CREATE TABLE IF NOT EXISTS" : "CREATE TABLE"} ${this.asIdentifier(table_name)} (
            ${table_specs.join(",")}
        );`);

        if (!result.status) {
            throw new DBError(result.message);
        }

        return {
            name: table_name,
            primaryKey: primary_key_,
            columns: columns_
        };
    }

    /**
     * @async
     * @override
     *  
     * Drops the specified table if exists.
     * 
     * @param {string} tableName 
     * A string representing the table to be dropped.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled when the process is completed.
     * 
     * @throws {DBError}
     * When failed to create a table.
     */
    async dropTable(tableName) {
        const table_name = String(tableName);

        const result = await this.execute(sql`
            DROP TABLE IF EXISTS ${this.asIdentifier(table_name)}
        `);

        if (!result.status) {
            throw new DBError(result.message);
        }
    }

    fixPreparedStatementQuery(query) {
        const query_ = String(query);
        let count = 1;
        return query_.replaceAll("?", () => ("$" + count++));
    }

    asIdentifier(rawIdentifier) {
        return asSqlIdentifier(rawIdentifier);
    }

    asString(rawString) {
        return asSqlString(rawString);
    }

    asValue(rawValue) {
        return asSqlValue(rawValue);
    }
}

module.exports = PostgreSQLConnector;
