import { compressToUint8Array, decompressFromUint8Array } from './lzstring';
import { getHmacKey, getAesKey, getSha1, decryptFromBase64, verifyHmac, encryptUint8Array, getHmac } from './crypto-primitives'

export function createCryptoManager(password, library) {
    let hmacKeyPromise = getHmacKey(password);
    let aesKeyPromise = getAesKey(password);
    let hashPromise = getSha1(password);

    let libraryPromise = hmacKeyPromise
        .then(key =>
            verifyHmac(key, library.library, library.hmac)
                .then(() => JSON.parse(library.library))
        );

    let libraryVersionPromise = libraryPromise.then(library => library.library_version);

    /**
     * @param blob           string
     * @param libraryVersion int
     * @param apiVersion     int
     * @returns object
     */
    function createLibrary(blob, libraryVersion, apiVersion) {
        return {
            blob: blob,
            library_version: libraryVersion,
            api_version: apiVersion,
            modified: Math.round(new Date().getTime() / 1000)
        };
    }

    return {
        getPasswordList: () => Promise
            .all([aesKeyPromise, libraryPromise])
            .then(params => {
                let [key, library] = params;

                return decryptFromBase64(key, library.library_version, library.blob);
            })
            .then(decompressFromUint8Array)
            .then(JSON.parse),
        encryptPasswordList: (passwordList, newKey) => {
            libraryVersionPromise = libraryVersionPromise.then(libraryVersion => libraryVersion + 1);

            if (newKey) {
                hmacKeyPromise = getHmacKey(newKey);
                aesKeyPromise = getAesKey(newKey);
                hashPromise = getSha1(newKey);
            }

            const compressedBytes = compressToUint8Array(JSON.stringify(passwordList));

            let blobPromise = Promise.all([aesKeyPromise, libraryVersionPromise])
                .then(params => encryptUint8Array(params[0], compressedBytes, params[1]));

            libraryPromise = Promise.all([blobPromise, libraryVersionPromise])
                .then(params => createLibrary(params[0], params[1], 2 /* api version */));

            let libraryJsonPromise = libraryPromise.then(JSON.stringify);

            let hmacPromise = Promise.all([hmacKeyPromise, libraryJsonPromise])
                .then(params => getHmac(params[0], params[1]));

            return Promise.all([libraryJsonPromise, hmacPromise])
                .then(params => {
                    return {
                        library: params[0],
                        hmac: params[1]
                    };
                });
        },
        getHash: () => hashPromise
    };
}

export function generateRandomPassword(length, alphabetHint) {
    const passwordLength = length || 16;
    const alphabet = alphabetHint || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?:;[]~!@#$%^&*()-+/';
    const getRandomChar = () => alphabet[Math.floor(Math.random() * alphabet.length)];

    return (new Uint8Array(passwordLength)).map(getRandomChar).join('');
}
