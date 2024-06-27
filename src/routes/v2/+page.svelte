<script lang="ts">
    import { onMount } from "svelte";
    import { OntologyInterface } from "./OntologyInterface";
    import ProblemSelect from "./ProblemSelect.svelte";

    let problemDefinition;
    let ontologyInterface;

    $: problemDefinition && updateProblem();

    function updateProblem() {
        console.log('problem changed')
        const refrenceProblem = ontologyInterface.createClassObject('Problem', problemDefinition)
        console.log(ontologyInterface.knownInstances)
        ontologyInterface.getEquations('SystemInStateEquation', ontologyInterface.knownInstances.S_1)
    }

    onMount(async() => {
        //const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/src/lib/thermodynamics.owl.ttl'
        const url = 'https://raw.githubusercontent.com/leitte/test-pyodide/main/static/myOntology.owl.ttl';
        ontologyInterface = await OntologyInterface.createInstance(url);
        console.log("ontology loaded", ontologyInterface.size)
        //ontologyInterface.print()
        /*
        ontologyInterface.createClassObject('State')
        ontologyInterface.createClassObject('Temperature')
        ontologyInterface.getEquations('SystemInStateEquation')
        */
    });
</script>

<h1>Hello World</h1>

<ProblemSelect bind:problem={problemDefinition}/>


{#if problemDefinition}
    <pre>
        {JSON.stringify(problemDefinition, null, 2)}
    </pre>
{/if}



<style>

</style>