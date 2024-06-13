// https://svelte.dev/repl/d78d7327830442ab87cc47bcee1033f9?version=3.43.1

import { writable } from 'svelte/store'
import * as $rdf from 'rdflib';

export function createOntologyStore() {
    const { subscribe, update, set } = writable($rdf.graph());

    return {
        subscribe,
        set: (newGraph) => set(newGraph),
        init: () => {
            return new Promise((resolve) => {
                setTimeout(() => {

                    resolve("ontology loaded")
                }, 500)
            })
        }
    }
}

export const ontology_store = createOntologyStore()