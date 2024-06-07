<script>
    import { onMount } from "svelte";
    import { pyodide } from "./stores";
    
    export let label = "Submit";
    let pythonStatus = "loading"

    onMount(async() => {
        let pyodideInstance = await loadPyodide();
        pyodide.update(() => pyodideInstance);
        console.log("python is ready")
        pythonStatus = "finished"
    });
</script>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

<button class="buttonload">
    {#if pythonStatus === 'loading'}
        <i class="fa fa-circle-o-notch fa-spin"></i>
        Loading python
    {:else}
        {label}
    {/if}
</button>

<style>
    .buttonload {
    background-color: #2196F3; /* Blue background */
    border: none; /* Remove borders */
    color: white; /* White text */
    padding: 12px 16px; /* Some padding */
    font-size: 16px /* Set a font size */
    }
</style>