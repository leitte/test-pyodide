<script lang="ts">
    import { onMount } from 'svelte';

    export let problem;

    let problems = [];
    let selectedProblemIndex = undefined;

    $: problem = problems[selectedProblemIndex] ?? undefined;

    onMount(async() => {
        const problemFiles = import.meta.glob('/src/lib/problems/*.json');
        console.log(problemFiles)
        Object.keys(problemFiles).forEach(async(path,index) => {
            const fileContents = await problemFiles[path]();
            problems = [...problems, fileContents.default];
        });
    })
</script>

<select bind:value={selectedProblemIndex} on:change={(event) => console.log('change',event)}>
    <option value="">--Please choose a problem--</option>
    {#each problems as sampleProblem, index}
        <option value={parseInt(index)}>
            {sampleProblem.name}
        </option>
    {/each}
</select>


<style>
    select {
        background-color: #2196F3; /* Blue background */
        border: none; /* Remove borders */
        color: white; /* White text */
        padding: 12px 16px; /* Some padding */
        font-size: 16px /* Set a font size */
    }
</style>