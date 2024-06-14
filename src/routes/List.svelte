<script>
    import Switch from "./Switch.svelte";
    import { createEventDispatcher } from "svelte";

    export let name = "State";
    export let id = "0";
    
    export let attributeOptions = {};
    export let variableOptions = {};

    let attributes = {};
    let variables = [];
    let input = "";

    const dispatch = createEventDispatcher();

    $: nEntries = Object.keys(variables).length + Object.keys(attributeOptions).length;

    function handleKeypress(event) {
        if (event.keyCode === 13) {
            let [variable,value] = input.split("=").map(part => part.trim())
            if (variable in attributeOptions) {
                attributes[variable] = {value: true, disabled: false};
            }
            else if (variable in variableOptions) {
                variableOptions[variable].active = true;
                if (!variables.includes(variable)) {
                    variables.push(variable);
                }
                
                const num = parseFloat(value);
                if (!isNaN(num) && isFinite(num)) {
                    console.log("value", value)
                    variableOptions[variable].value = num;
                }
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
            concept: name,
            variables: variableOptions
        });
    }

    function removeVariable(event) {
        console.log(event)
        console.log(event.srcElement.name)
        const v = event.srcElement.name;
        variableOptions[v].value = NaN;
        variableOptions[v].active = false;
    }
</script>

<div class="change-of-state">
    <label class="item heading">
        <b>{name}<sub>{id}</sub></b>
    </label>

    <div class="stretch-height">
        {#if nEntries > 0}
            {#each Object.entries(attributeOptions) as [attr,props]}
                <div class="item">
                    <Switch label={attr} checked={props.value} disabled={props.fixed}/>
                </div>
            {/each}
            {#each Object.entries(attributes) as [attr,props]}
                <div class="item">
                    <Switch label={attr} checked={props.value} disabled={props.disabled}/>
                </div>
            {/each}
            <div class="table">
                {#each variables as v}
                    {#if variableOptions[v].active}
                        <label class="variable">{v}<sub>{id}</sub></label>
                        <input type="number" class="value" placeholder="NaN" bind:value={variableOptions[v].value}>
                        <label class="unit">{@html variableOptions[v].unit}</label>
                        <button name="{v}" on:click={removeVariable}>x</button>
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
        <button class="info-button" on:click|preventDefault={helpButtonClicked}>?</button>
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
        grid-template-columns: 1fr 2fr 1fr 20px;
        gap: 5px 15px;
        padding: 0 1em;
    }
    .variable {
        text-align: right;
    }
    .value {
        min-width: 50px;
    }

    .info-button {
        border-radius: 50%;
        width: 1.5em;
        height: 1.5em;
        border: none;
        color: white;
        margin-left: .5em;
        cursor: pointer;
    }
</style>