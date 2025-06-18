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

#include "gdbm_wrapper.h"
#include <gdbm.h>
#include <stdio.h>
#include <string.h>

static inline gdbm_error get_errno(GDBM_FILE dbf) {
#if GDBM_VERSION_MAJOR > 1 || GDBM_VERSION_MINOR >= 13
    return gdbm_last_errno(dbf);
#else
    return gdbm_errno;
#endif
}

static inline error_t to_no_error() {
    return (error_t){GDBM_NO_ERROR, NULL};
}

static inline error_t to_error(gdbm_error errno) {
    return errno != GDBM_NO_ERROR ? (error_t){errno, gdbm_strerror(errno)}
                                  : to_no_error();
}

void print_gdbm_version() {
    fprintf(stderr, "%s\n", gdbm_version);
}

GDBM_FILE open_db_(const char *name, int block_size, int open_flags) {
    int open_mode = 0400 | 0200;
    void (*fatal_func)(const char *);
    fatal_func = NULL;
    GDBM_FILE dbf =
        gdbm_open(name, block_size, open_flags, open_mode, fatal_func);
    return dbf;
}

error_t close_db_(GDBM_FILE dbf) {
    error_t err;
#if GDBM_VERSION_MAJOR > 1 || GDBM_VERSION_MINOR >= 17
    int ret = gdbm_close(dbf);
    err = ret != 0 ? to_error(gdbm_errno) : to_no_error();
#else
    gdbm_close(dbf);
    err = to_no_error();
#endif
    return err;
}

error_t wrap_create_db(const char *name, int block_size) {
    int open_flags = GDBM_WRCREAT;
    GDBM_FILE dbf = open_db_(name, block_size, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    error_t err = close_db_(dbf);

    return err;
}

error_t wrap_clean_db(const char *name, int block_size) {
    int open_flags = GDBM_NEWDB;
    GDBM_FILE dbf = open_db_(name, block_size, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    error_t err = close_db_(dbf);

    return err;
}

error_t wrap_count(const char *name, int *count) {
    int open_flags = GDBM_READER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key = gdbm_firstkey(dbf);
    int counter = 0;
    while (key.dptr != NULL) {
        counter++;
        datum next_key = gdbm_nextkey(dbf, key);
        key = next_key;
    }

    error_t err = close_db_(dbf);
    if (err.code != GDBM_NO_ERROR) {
        return err;
    }

    *count = counter;

    return err;
}

error_t wrap_insert(
    const char *name, char *key_p, int key_len, char *data_p, int data_len
) {
    int open_flags = GDBM_WRITER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key_d = {key_p, key_len};
    datum content_d = {data_p, data_len};

    // insert
    int insert_flag = GDBM_INSERT;
    int ret = gdbm_store(dbf, key_d, content_d, insert_flag);

    gdbm_error errno = get_errno(dbf);
    error_t err_close = close_db_(dbf);
    if (err_close.code != GDBM_NO_ERROR) {
        return err_close;
    }

    error_t err;
    if (ret == 0) {
        err = to_no_error();
    } else if (ret > 0) {
        err = (error_t){-1, gdbm_strerror(GDBM_CANNOT_REPLACE)};
    } else {
        err = to_error(errno);
    }

    return err;
}

error_t wrap_remove(const char *name, char *key_p, int key_len) {
    int open_flags = GDBM_WRITER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key_d = {key_p, key_len};

    // delete
    int ret = gdbm_delete(dbf, key_d);

    gdbm_error errno = get_errno(dbf);
    error_t err_close = close_db_(dbf);
    if (err_close.code != GDBM_NO_ERROR) {
        return err_close;
    }

    error_t err;
    if (ret == 0) {
        err = to_no_error();
    } else if (errno == GDBM_ITEM_NOT_FOUND) {
        err = (error_t){-1, NULL};
    } else {
        err = to_error(errno);
    }

    return err;
}

error_t wrap_exists(const char *name, char *key_p, int key_len, bool *result) {
    int open_flags = GDBM_READER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key_d = {key_p, key_len};

    int ret = gdbm_exists(dbf, key_d);

    gdbm_error errno = get_errno(dbf);
    error_t err_close = close_db_(dbf);
    if (err_close.code != GDBM_NO_ERROR) {
        return err_close;
    }

    if (ret == 0 && errno != GDBM_NO_ERROR) {
        return to_error(errno);
    }

    *result = ret;
    error_t err = to_no_error();

    return err;
}

error_t wrap_fetch(
    const char *name, char *key_p, int key_len, char **data_p, int *data_len
) {
    int open_flags = GDBM_READER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key_d = {key_p, key_len};

    // fetch
    datum content = gdbm_fetch(dbf, key_d);

    gdbm_error errno = get_errno(dbf);
    error_t err_close = close_db_(dbf);
    if (err_close.code != GDBM_NO_ERROR) {
        return err_close;
    }

    error_t err;
    if (content.dptr == NULL) {
        err = errno == GDBM_ITEM_NOT_FOUND ? (error_t){-1, gdbm_strerror(errno)}
                                           : to_error(errno);
    } else {
        *data_p = content.dptr;
        *data_len = content.dsize;
        err = to_no_error();
    }

    return err;
}

error_t wrap_replace(
    const char *name, char *key_p, int key_len, char *data_p, int data_len
) {
    int open_flags = GDBM_WRITER;
    GDBM_FILE dbf = open_db_(name, 0, open_flags);
    if (dbf == NULL) {
        error_t err = to_error(gdbm_errno);
        return err;
    }

    datum key_d = {key_p, key_len};
    datum content_d = {data_p, data_len};

    // check exists
    int ret_exists = gdbm_exists(dbf, key_d);
    if (ret_exists == 0) {
        gdbm_error errno = get_errno(dbf);
        error_t err_close = close_db_(dbf);
        if (err_close.code != GDBM_NO_ERROR) {
            return err_close;
        }
        errno = errno == GDBM_NO_ERROR ? GDBM_ITEM_NOT_FOUND : errno;
        error_t err_exsits = to_error(errno);
        return err_exsits;
    }

    // replace
    int replace_flag = GDBM_REPLACE;
    int ret = gdbm_store(dbf, key_d, content_d, replace_flag);

    error_t err_close = close_db_(dbf);
    if (err_close.code != GDBM_NO_ERROR) {
        return err_close;
    }

    error_t err = ret == 0 ? to_no_error() : to_error(gdbm_errno);

    return err;
}
