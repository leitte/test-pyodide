<script>
    import Switch from "../../routes/Switch.svelte";

    export let id = 0;
    let stateAttributes = {"in equilibrium": true};
    let stateVariables = [];
    const stateVariableOptions = {p: "Pascal",
        T: "K",
        V: "m<sup>3</sup>"
    }
    let newVariable = "";

    function handleKeypress (event) {
        if (event.keyCode === 13) {
            let [variable,value] = newVariable.split("=").map(part => part.trim())
            console.log(event, newVariable.split("=").map(part => part.trim()));
            stateVariables = [...stateVariables, {variable, value}];
            newVariable = "";
        }
    }
</script>

<div class="state">
    <label class="heading"><b>State<sub>{id}</sub></b></label>
    
    {#if (stateVariables.length + Object.keys(stateAttributes).length) > 0}
        {#each Object.entries(stateAttributes) as [attr,value]}
            <div class="attribute">
                <Switch label={attr}/>
            </div>
        {/each}
        {#each stateVariables as svar}
            <label class="variable">{svar.variable}<sub>{id}</sub></label>
            <input type="number" class="value" placeholder="NaN" bind:value={svar.value}>
            {#if svar.variable in stateVariableOptions}
                <label class="unit">{@html stateVariableOptions[svar.variable]}</label>
            {/if}
        {/each}
    {:else}
        <label class="placeholder">No variables included yet.</label>
    {/if}
    <label class="add-item">+ <input type="text" style:flex="1" style:margin-left=".5em" placeholder="Enter a variable..." on:keypress={handleKeypress} bind:value={newVariable}/></label>
    <slot />
</div>

<style>
    .state {
        width: 250px;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
		padding: 0;
		margin: 0 0 1em 0;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 5px 15px;
    }

    .heading {
        grid-column: 1 / span 3;
        padding: .5em 1em;
        background-color: #9bccf3;
        border-bottom: 1px solid #aaa;
    }
    .placeholder {
        grid-column: 1 / span 3;
        padding: .5em 1em;
        color: #aaa;
    }
    .attribute {
        grid-column: 1 / span 3;
        padding: .5em 1em;
    }
    .variable {
        grid-column: 1 / 2;
        padding: .25em 1em;
        text-align: right;
    }
    .value {
        grid-column: 2 / 3;
        width: 100px;
        padding: .25em 0;
    }
    .unit {
        grid-column: 3 / 4;
        padding: .25em 0;
    }

    .add-item {
        grid-column: 1 / span 3;
        display: flex;
        padding: .5em 1em;
        border-top: 1px solid #aaa;
    }
</style>