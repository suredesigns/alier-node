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

const CredStore = require("./_CredentialsStore.js");
const { StoreClasses, registerTable, Users } = require("./_CredentialsInterface.js");

for (const storeClass of Object.values(CredStore)) {
    if (storeClass !== CredStore.AbstractCredentialStore) {
        StoreClasses.register(storeClass);
    }
}

module.exports = {
    AbstractCredentialStore: CredStore.AbstractCredentialStore,
    StoreClasses,
    registerTable,
    Users,
};
