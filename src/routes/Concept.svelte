<script>
    import Switch from "./Switch.svelte";

    export let data;

    let attributes = [];
    let variables = [];

    $: if (data.properties) {
        attributes = Object.keys(data?.properties).filter(key => data.properties[key].type.includes('bool')).sort();
    }
    $: if (data.properties) {
        variables = Object.keys(data?.properties).filter(key => data.properties[key].type.includes('Variable')).sort();
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
        </label>
    {/if}
    {#each attributes as attr}
        <div class="item c1">
            <Switch bind:checked={data.properties[attr]['value']}/>
        </div>
        
        <label class="label">{label(attr)}</label>
        <label class="item c3">{data.properties[attr]['value']}</label>
    {/each}
    <div class="hline" style:justify-self="stretch"/>
    {#each variables as v}
        <label class="item c1">{data.properties[v]['rdfs:label']}</label>
        <input class="c2" type="number" placeholder="NaN" bind:value={data.properties[v].value} />
        <label class="item c3">{data.properties[v]['unit']}</label>
    {/each}
</div>

<style>
    .wrapper {
        width: 250px;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1);
        display: grid;
        grid-template-columns: minmax(15px, 1fr) 1fr minmax(15px, 1fr) minmax(10px, 1fr);
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

    .label {
        grid-column: 2/3;
        background-color: bisque;
        padding: 5px;
    }
</style>