<script>
    import Switch from "./Switch.svelte";

    export let data;

    let attributes = [];
    let variables = [];
    let concepts = [];
    let equations = [];

    function filterProperties(propertyType) {
        return Object.keys(data?.properties).filter(key => data.properties[key].type.includes(propertyType)).sort()
    }
    $: if (data.properties) {
        attributes = filterProperties('bool');
        variables = filterProperties('Variable');
        concepts = filterProperties('Concept');
        equations = filterProperties('Equation');
    }

    function label(prop) {
        return data.properties[prop]['rdfs:label']
    }
    function value(prop) {
        return data.properties[attr]['value']
    }
    //$: console.log(Object.keys(data.properties).sort())
</script>


<div class="wrapper">
    {#if data}
        <label class="heading">
            <b>{data.label}<sub>{""}</sub></b>
            <b>{data.name}</b>
        </label>
    {/if}
    {#each attributes as attr}
        <div class="item c1">
            <Switch 
                bind:checked={data.properties[attr].value}
                disabled={data.properties[attr].fixed}
            />
        </div>
        
        <label class="label">{label(attr)}</label>
        <!--
        <label class="item c3">{data.properties[attr]['value']}</label>
        -->
    {/each}
    <div class="hline" style:justify-self="stretch"/>
    {#each concepts as concept}
        <div class="item concept-label">
           {concept} 
        </div>
        <div class="item c34">
            {data.properties[concept]?.value?.name}
        </div>
    {/each}
    <div class="hline" style:justify-self="stretch"/>
    {#each variables as v}
        <label class="item c1">{data.properties[v]['rdfs:label']}</label>
        <input class="c2" type="number" placeholder="NaN" bind:value={data.properties[v].value} />
        <label class="item c3 unit">{data.properties[v]['unit']}</label>
        <button class="c4">X</button>
    {/each}
    <div class="hline" style:justify-self="stretch"/>
    {#each equations as equation}
        <label class="item c-all">{data.properties[equation].range?.split(/[#/]/).at(-1)}</label>
    {/each}
    <div class="hline" style:justify-self="stretch"/>
    <label class="item c1">+</label>
    <input class="input"/>
    <button class="c4">?</button>
</div>

<style>
    .wrapper {
        width: 270px;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
        display: grid;
        grid-template-columns: minmax(40px, .6fr) 1.4fr 70px 25px;
    }

    .item {
        padding: 5px;
    }

    .heading {
        grid-column: 1 / -1;
        background-color: #9bccf3;
        border-bottom: 1px solid #aaa;
        padding: 5px;
    }

    .concept-label {
        grid-column: 1 / 3;
        justify-self: end;
    }

    .c34 {
        grid-column: 3 / -1;
    }

    input {
        min-width: 50px;
        margin: 2.5px;
    }

    .hline {
        grid-column: 1 / -1;
        border-bottom: 1px solid #aaa;
    }

    .c1 {
        grid-column: 1/2;
        justify-self: end;
    }

    .c2 {
        grid-column: 2 / 3;
    }

    .c-all {
        grid-column: 1 / -1;
    }

    .label {
        grid-column: 2/3;
        padding: 5px;
    }

    .unit {
        font-size: 85%;
    }

    .input {
        grid-column: 2 / 4;
        margin: 2.5px;
    }

    button.c4 {
        cursor: pointer;
        border: none;
        background: none;
        font-size: 85%;
        color: #333;
    }
</style>