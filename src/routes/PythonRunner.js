import { writable, get } from 'svelte/store';
import * as $rdf from 'rdflib';

export const graphStore = writable($rdf.graph());


export function createGraphStore() {
    const { subscribe, set, update } = writable($rdf.graph());

    return {
        subscribe,
        init: async (text) => {await initGraph2(text)}
        //init: async () => set(await initGraph2('https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics_concepts.owl.ttl'));
    }
}

async function initGraph2(text) {    
    const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics_concepts.owl.ttl';
    const mimeType = 'text/turtle'
    const g = $rdf.graph()

    try {
        $rdf.parse(text, g, url, mimeType)
    } catch (err) {
        console.log(err)
    }
    console.log('loaded graph ####2', g.match(null,null,null).length)

    return g
}

export const graphStore2 = createGraphStore();




export async function getClassProperties( className ) {
    if (graphSize() === 0) {
        await initGraph('https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics.owl.ttl')
    }

    const g = get(graphStore);
    const THMO = $rdf.Namespace(g.namespaces.thmo_concepts)
    const RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
    const RDF = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
    const OWL = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
    

    const classNode = $rdf.sym(THMO(className).uri);
    const results = {};

    /*
SELECT DISTINCT ?property ?range WHERE {{
            <{uri}> rdfs:subClassOf+ ?restriction .
            ?restriction rdf:type owl:Restriction .
            ?restriction owl:onProperty ?property .
            {{
                {{ ?property rdfs:range ?range }} UNION
                {{ ?restriction owl:allValuesFrom ?range }}
            }}
        }}
    */
    function findPropertiesAndRanges(node) {
        const subclasses = g.each(node, RDFS('subClassOf'), null);
        subclasses.forEach(subclass => {
            // If subclass is a Restriction
            if (g.holds(subclass, RDF('type'), OWL('Restriction'))) {
                const property = g.any(subclass, OWL('onProperty'), null);
                const range = g.any(property, RDFS('range'), null) || g.any(subclass, OWL('allValuesFrom'), null);
                const label = g.any(property, RDFS('label'), null);

                if (property && range && label) {
                    results[property.uri] = {range: range.uri, label: label};
                }
            }
        })
    }

    findPropertiesAndRanges(classNode);
    //console.log(results)

    return results
}

export async function getAttributes(className) {
    const properties = await getClassProperties(className);
    const g = get(graphStore);
    const XSD = $rdf.Namespace('http://www.w3.org/2001/XMLSchema#');
    const booleanProps = Object.values(properties)
        .filter(prop => prop.range === XSD('boolean').uri)
        .map(prop => prop.label.value)
    return booleanProps.sort()
}

export function graphSize() {
    return get(graphStore).match(null,null,null).length;
}

async function initGraph(url) {    
    const response = await fetch(url);
    const text = await response.text()
    const mimeType = 'text/turtle'
    const g = $rdf.graph()

    try {
        $rdf.parse(text, g, url, mimeType)
        graphStore.set(g);
    } catch (err) {
        console.log(err)
    }
    console.log('loaded graph', graphSize())
}



