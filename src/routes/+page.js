import { getAttributes } from './PythonRunner'
import config_thmo from '$lib/config_thmo.json'
import { graphStore, graphStore2 } from './PythonRunner'
import { get } from 'svelte/store';


/** @type {import('./$types').PageLoad} */
export async function load({ fetch, params }) {
    const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/static/thermodynamics_concepts.owl.ttl';
    const response = await fetch(url);
    if (response.ok) {
        await graphStore2.init(await response.text());
        console.log("+++++++++++ store") //, get(graphStore2))
        
        const concepts = ["System", "Material", "State"];
        const data3 = concepts.reduce((data,c) => {
            data[c] = {};
            return data
        }, {});

        const data2 = await concepts.reduce(async (data, className) => {
            data[className] = {};
            console.log('##', className)
    
            const attr = await getAttributes(className);
            const attrData = attr.reduce((attrData,a) => {
                attrData[a] = {value: true, 
                               disable: config_thmo[className]?.fixed?.includes(a)};
                console.log('#',a)
                return attrData
            }, {});
            data[className] = {attributes: attrData};
            
            return data;
        }, {});

        console.log("data2",data3)
    }
    /*

    const concepts = ["System", "Material", "State"];
    
    const data2 = await concepts.reduce(async (data, className) => {
        data[className] = {};
        console.log('##', className)

        const attr = await getAttributes(className);
        const attrData = attr.reduce((attrData,a) => {
            attrData[a] = {value: true, 
                           disable: config_thmo[className]?.fixed?.includes(a)};
            console.log('#',a)
            return attrData
        }, {});
        data[className] = {attributes: attrData};
        
        return data;
    }, {});
    console.log("final", data2)
    
    //await getAttributes('Transition');
    return data2
    */
   return {}
}