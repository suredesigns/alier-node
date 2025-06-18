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

#ifndef _GDBM_WRAPPER_H_
#define _GDBM_WRAPPER_H_

#include <stdbool.h>

typedef struct {
    int code;
    const char *message;
} error_t;

error_t wrap_create_db(const char *name, int block_size);
error_t wrap_clean_db(const char *name, int block_size);

error_t wrap_count(const char *name, int *count);
error_t wrap_insert(
    const char *name, char *key_p, int key_len, char *data_p, int data_len
);
error_t wrap_remove(const char *name, char *key_p, int key_len);

error_t wrap_exists(const char *name, char *key_p, int key_len, bool *result);

error_t wrap_fetch(
    const char *name, char *key_p, int key_len, char **data_p, int *data_len
);
error_t wrap_replace(
    const char *name, char *key_p, int key_len, char *data_p, int data_len
);

void print_gdbm_version();

#endif // _GDBM_WRAPPER_H_
