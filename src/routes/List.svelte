<script>
    import Switch from "./Switch.svelte";
    import { createEventDispatcher } from "svelte";

    export let name = "State";
    export let id = "0";
    
    export let attributeOptions = {};
    export let variableOptions = {};

    let attributes = {"in equilibrium": {value: true, disabled: true}};
    let variables = {};
    let input = "";
    const options = {
        Q: {value: NaN, unit: "J"},
    };
    //const attributeOptions = ["isochoric","isothermal","polytropic","isobaric","isenthalpic","isentropic","adjabatic"]
    const dispatch = createEventDispatcher();

    $: nEntries = Object.keys(variables).length + Object.keys(attributes).length;

    function handleKeypress(event) {
        if (event.keyCode === 13) {
            let [variable,value] = input.split("=").map(part => part.trim())
            if (variable in attributeOptions) {
                attributes[variable] = {value: true, disabled: false};
            }
            else {
                variables[variable] = {value: value, unit: "xxx"};
            }
            input = "";
        }
    }

    function helpButtonClicked() {
        /*alert("Sorry, additional information not implemented yet.")*/
        dispatch('info', {
            concept: "ChangeOfState"
        });
    }
</script>

<div class="change-of-state">
    <label class="item heading">
        <b>{name}<sub>{id}</sub></b>
    </label>

    <div class="stretch-height">
        {#if nEntries > 0}
            {#each Object.entries(attributes) as [attr,props]}
                <div class="item">
                    <Switch label={attr} checked={props.value} disabled={props.disabled}/>
                </div>
            {/each}
            <div class="table">
                {#each Object.entries(variables) as [variable,props]}
                    <label class="variable">{variable}<sub>{id}</sub></label>
                    <input type="number" class="value" placeholder="NaN" bind:value={props.value}>
                    {#if variable in variableOptions}
                        <label class="unit">{@html variableOptions[variable].unit}</label>
                    {:else}
                        <label class="unit"></label>
                    {/if}
                {/each}
            </div>
        {:else}
            <label class="item">No variables included yet.</label>
        {/if}
    </div>

<!--
        <button on:click={helpButtonClicked}>?</button>

-->
    <div class="item add">
        <label>+</label> 
        <input type="text" class="stretch-width" placeholder="Enter a variable..." on:keypress={handleKeypress} bind:value={input}/>
        <button on:click|preventDefault={helpButtonClicked}>?</button>
    </div>
</div>

<style>
    .change-of-state {
        width: 250px;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }

    .item {
        padding: .5em 1em;
        
    }

    .heading {
        background-color: #9bccf3;
        border-bottom: 1px solid #aaa;
    }

    .add {
        display: flex;
        border-top: 1px solid #aaa;
    }

    .stretch-width {
        flex: 1;
        margin-left: .5em;
        box-sizing: border-box;
        min-width: 50px;
    }

    .stretch-height {
        flex: 1;
    }

    .table {
        display: grid;
        grid-template-columns: 1fr 2fr 1fr;
        gap: 5px 15px;
        padding: 0 1em;
    }
    .variable {
        text-align: right;
    }
    .value {
        min-width: 50px;
    }

    button {
        border-radius: 50%;
        width: 1.5em;
        height: 1.5em;
        border: none;
        color: white;
        margin-left: .5em;
        cursor: pointer;
    }
</style>