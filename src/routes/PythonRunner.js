import { writable, get } from 'svelte/store';
import * as $rdf from 'rdflib';


const graphStore = writable($rdf.graph());

export default graphStore;

export function getClassProperties( className ) {
    console.log('graph', graphSize())
    if (graphSize() === 0) {
        initGraph('/static/thermodynamics_concepts.owl.ttl')
    }
    return `hello ${className}`
}

function graphSize() {
    return get(graphStore).match(null,null,null).length;
}

async function initGraph(url) {
    var uri = 'https://github.com/leitte/test-pyodide/blob/main/static/thermodynamics_concepts.owl.ttl'
    var body = '<a> <b> <c> .'
    var mimeType = 'text/turtle'
    var store = $rdf.graph()

    const response = await fetch(uri);

    try {
        $rdf.parse(body, store, uri, mimeType)
        graphStore.set(store);
    } catch (err) {
        console.log(err)
    }

    /*
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}`);
    }
    const text = await response.text();
    const store = $rdf.graph();
    $rdf.parse(text, store, url, 'text/turtle');
    graphStore.set(store);
    */
    console.log('loaded graph', graphSize())
}