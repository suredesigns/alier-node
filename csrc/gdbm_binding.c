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

#include "gdbm_binding.h"
#include "gdbm_wrapper.h"
#include <assert.h>
#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// undefined createTable(string name, number blockSize)
static napi_value create_table(napi_env env, napi_callback_info info);
// undefined cleanTable(string name, number blockSize)
static napi_value clean_table(napi_env env, napi_callback_info info);

// number countRecords(string name)
static napi_value count_records(napi_env env, napi_callback_info info);
// undefined insertRecord(string name, string key, uint8array content)
static napi_value insert_record(napi_env env, napi_callback_info info);
// undefined removeRecord(string name, string key)
static napi_value remove_record(napi_env env, napi_callback_info info);

// boolean hasKey(string name, string key)
static napi_value has_key(napi_env env, napi_callback_info info);

// buffer getContent(string name, string key)
static napi_value get_content(napi_env env, napi_callback_info info);
// undefined updateContent(string name, string key, buffer content)
static napi_value update_content(napi_env env, napi_callback_info info);

static napi_value create_table(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 2) {
        napi_throw_type_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_number) {
        napi_throw_type_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long name");
        return NULL;
    }

    int32_t block_size;
    status = napi_get_value_int32(env, args[1], &block_size);
    assert(status == napi_ok);

    error_t err = wrap_create_db(name_buf, (int)block_size);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_undefined(env, &result);
    assert(status == napi_ok);

    return result;
}

static napi_value clean_table(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 2) {
        napi_throw_type_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_number) {
        napi_throw_type_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long name");
        return NULL;
    }

    int32_t block_size;
    status = napi_get_value_int32(env, args[1], &block_size);
    assert(status == napi_ok);

    error_t err = wrap_clean_db(name_buf, (int)block_size);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_undefined(env, &result);
    assert(status == napi_ok);

    return result;
}

static napi_value count_records(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 1;
    napi_value argv[1];
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 1) {
        napi_throw_type_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype;
    status = napi_typeof(env, argv[0], &valuetype);
    assert(status == napi_ok);

    if (valuetype != napi_string) {
        napi_throw_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, argv[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long name");
        return NULL;
    }

    int32_t count;
    error_t err = wrap_count(name_buf, &count);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_create_int32(env, count, &result);
    assert(status == napi_ok);

    return result;
}

static napi_value insert_record(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 3;
    napi_value args[3];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 3) {
        napi_throw_type_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    napi_valuetype valuetype2;
    status = napi_typeof(env, args[2], &valuetype2);
    assert(status == napi_ok);

    bool is_typedarray2;
    status = napi_is_typedarray(env, args[2], &is_typedarray2);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_string ||
        valuetype2 != napi_object || !is_typedarray2) {
        napi_throw_type_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long name");
        return NULL;
    }

    char key_buf[TABLE_KEY_SIZE];
    size_t key_bufsize = TABLE_KEY_SIZE;
    size_t key_len;
    status = napi_get_value_string_utf8(
        env, args[1], key_buf, key_bufsize, &key_len
    );
    assert(status == napi_ok);

    if (key_len == key_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long key");
        return NULL;
    }

    char *content_buf;
    napi_typedarray_type content_type;
    size_t content_len;
    size_t content_offset;
    status = napi_get_typedarray_info(
        env, args[2], &content_type, &content_len, (void *)(&content_buf), NULL,
        &content_offset
    );
    assert(status == napi_ok);

    if (content_type != napi_uint8_array || content_offset != 0) {
        napi_throw_error(env, NULL, "Invalid content type");
        return NULL;
    }

    // UInt8Array from empty string or undefined will be NULL content
    if (content_len == 0 && content_buf == NULL) {
        content_buf = "";
    }

    error_t err =
        wrap_insert(name_buf, key_buf, key_len, content_buf, content_len);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_boolean(env, err.code == 0, &result);
    assert(status == napi_ok);

    return result;
}

static napi_value remove_record(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 2) {
        napi_throw_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_string) {
        napi_throw_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long table name");
        return NULL;
    }

    char key_buf[TABLE_KEY_SIZE];
    size_t key_bufsize = TABLE_KEY_SIZE;
    size_t key_len;
    status = napi_get_value_string_utf8(
        env, args[1], key_buf, key_bufsize, &key_len
    );
    assert(status == napi_ok);

    if (key_len == key_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long key");
        return NULL;
    }

    error_t err = wrap_remove(name_buf, key_buf, key_len);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_boolean(env, err.code == 0, &result);
    assert(status == napi_ok);

    return result;
}

static napi_value has_key(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 2) {
        napi_throw_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_string) {
        napi_throw_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long table name");
        return NULL;
    }

    char key_buf[TABLE_KEY_SIZE];
    size_t key_bufsize = TABLE_KEY_SIZE;
    size_t key_len;
    status = napi_get_value_string_utf8(
        env, args[1], key_buf, key_bufsize, &key_len
    );
    assert(status == napi_ok);

    if (key_len == key_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long key");
        return NULL;
    }

    bool exists;
    error_t err = wrap_exists(name_buf, key_buf, key_len, &exists);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_boolean(env, exists, &result);
    assert(status == napi_ok);

    return result;
}

void finalize_content(napi_env env, void *finalize_data, void *finalize_hint) {
    free(finalize_data);
}

static napi_value get_content(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 2;
    napi_value args[2];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 2) {
        napi_throw_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_string) {
        napi_throw_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long table name");
        return NULL;
    }

    char key_buf[TABLE_KEY_SIZE];
    size_t key_bufsize = TABLE_KEY_SIZE;
    size_t key_len;
    status = napi_get_value_string_utf8(
        env, args[1], key_buf, key_bufsize, &key_len
    );
    assert(status == napi_ok);

    if (key_len == key_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long key");
        return NULL;
    }

    char *data_p = NULL;
    int data_len;
    error_t err = wrap_fetch(name_buf, key_buf, key_len, &data_p, &data_len);

    if (err.code > 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    if (data_p != NULL) {
        napi_value content_buf;
        status = napi_create_external_arraybuffer(
            env, (void *)data_p, (size_t)data_len, finalize_content, NULL,
            &content_buf
        );
        assert(status == napi_ok);

        status = napi_create_typedarray(
            env, napi_uint8_array, (size_t)data_len, content_buf, 0, &result
        );
        assert(status == napi_ok);
    } else {
        status = napi_get_undefined(env, &result);
        assert(status == napi_ok);
    }

    return result;
}

static napi_value update_content(napi_env env, napi_callback_info info) {
    napi_status status;

    size_t argc = 3;
    napi_value args[3];
    status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
    assert(status == napi_ok);

    if (argc < 3) {
        napi_throw_type_error(env, NULL, "Wrong number of arguments");
        return NULL;
    }

    napi_valuetype valuetype0;
    status = napi_typeof(env, args[0], &valuetype0);
    assert(status == napi_ok);

    napi_valuetype valuetype1;
    status = napi_typeof(env, args[1], &valuetype1);
    assert(status == napi_ok);

    napi_valuetype valuetype2;
    status = napi_typeof(env, args[2], &valuetype2);
    assert(status == napi_ok);

    bool is_typedarray2;
    status = napi_is_typedarray(env, args[2], &is_typedarray2);
    assert(status == napi_ok);

    if (valuetype0 != napi_string || valuetype1 != napi_string ||
        valuetype2 != napi_object || !is_typedarray2) {
        napi_throw_type_error(env, NULL, "Wrong arguments");
        return NULL;
    }

    char name_buf[TABLE_NAME_SIZE];
    size_t name_bufsize = TABLE_NAME_SIZE;
    size_t name_len;
    status = napi_get_value_string_utf8(
        env, args[0], name_buf, name_bufsize, &name_len
    );
    assert(status == napi_ok);

    if (name_len == name_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long name");
        return NULL;
    }

    char key_buf[TABLE_KEY_SIZE];
    size_t key_bufsize = TABLE_KEY_SIZE;
    size_t key_len;
    status = napi_get_value_string_utf8(
        env, args[1], key_buf, key_bufsize, &key_len
    );
    assert(status == napi_ok);

    if (key_len == key_bufsize - 1) {
        napi_throw_error(env, NULL, "Too long key");
        return NULL;
    }

    char *content_buf;
    napi_typedarray_type content_type;
    size_t content_len;
    size_t content_offset;
    status = napi_get_typedarray_info(
        env, args[2], &content_type, &content_len, (void *)(&content_buf), NULL,
        &content_offset
    );
    assert(status == napi_ok);

    if (content_type != napi_uint8_array || content_offset != 0) {
        napi_throw_error(env, NULL, "Invalid content type");
        return NULL;
    }

    // UInt8Array from empty string or undefined will be NULL content
    if (content_len == 0 && content_buf == NULL) {
        content_buf = "";
    }

    error_t err =
        wrap_replace(name_buf, key_buf, key_len, content_buf, content_len);

    if (err.code != 0) {
        char error_code_buf[ERROR_CODE_SIZE];
        snprintf(error_code_buf, ERROR_CODE_SIZE, "GDBM_ERR_%d", err.code);
        char error_msg_buf[ERROR_BUFFER_SIZE];
        snprintf(
            error_msg_buf, ERROR_BUFFER_SIZE, "[GDBM] %s",
            err.message != NULL ? err.message : "unexpected error"
        );
        napi_throw_error(env, error_code_buf, error_msg_buf);
        return NULL;
    }

    napi_value result;
    status = napi_get_undefined(env, &result);
    assert(status == napi_ok);

    return result;
}

napi_property_descriptor
method_desc_(const char *name, napi_value (*cb)(napi_env, napi_callback_info)) {
    napi_property_descriptor desc = {
        name, NULL, cb, NULL, NULL, NULL, napi_default_jsproperty, NULL
    };
    return desc;
}

/*napi_value*/ NAPI_MODULE_INIT(/*napi_env env, napi_value exports*/) {
#ifdef DEBUG
    print_gdbm_version();
#endif

    napi_property_descriptor descriptors[] = {
        method_desc_("createTable", create_table),
        method_desc_("cleanTable", clean_table),
        method_desc_("countRecords", count_records),
        method_desc_("insertRecord", insert_record),
        method_desc_("removeRecord", remove_record),
        method_desc_("hasKey", has_key),
        method_desc_("getContent", get_content),
        method_desc_("updateContent", update_content),
    };
    napi_status status;
    status = napi_define_properties(
        env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors
    );
    if (status != napi_ok) {
        napi_throw_error(env, NULL, "Failed to create function");
        return NULL;
    }

    return exports;
}
