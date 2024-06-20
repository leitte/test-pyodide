import * as $rdf from 'rdflib';
import config_thmo from '$lib/config_thmo.json'
import State from '$lib/backup/State.svelte';

class Ontology {
    CONCEPT_ABBREVIATIONS = {
        System: "Sys",
        Material: "M",
        State: "S",
        ChangeOfState: "CoS"
    }

    constructor(ontologyTTL, url) {
        this.g = $rdf.graph();
        const mimeType = 'text/turtle'
        try {
            $rdf.parse(ontologyTTL, this.g, url, mimeType)
            Object.entries(this.g.namespaces).forEach(([key,value]) => {
                this[key.toUpperCase()] = $rdf.Namespace(value);
            });
            //this['SCHEMA'] = $rdf.Namespace('http://schema.org/')

            //this.attributes('Transition');
        } catch (err) {
            console.log(err)
        }
    }

    static async createInstance(url) {
        const data = await fetch(url);
        const ontologyTTL = await data.text();
        return new Ontology(ontologyTTL, url);
    }

    get size() {
        return this.countTriples();
    }

    countTriples() {
        return this.g.match(null,null,null).length;
    }

    hasRange(class_uri, range_uri) {
        return this.g.holds(class_uri, this.RDFS('range'), range_uri)
    }

    hasType(class_uri, type_uri) {
        return this.g.holds(class_uri, this.RDF('type'), type_uri)
    }

    getLabel(node) {
        const label = this.g.any(node, this.RDFS('label'), null);
        if (label) {
            return label.toString();
        }
        // TODO: handle error case
        return "";
    }

    getAttributeConfig(className, attrName) {
        return {value: config_thmo[className]?.[attrName] ?? true,
                fixed: config_thmo[className]?.fixed?.includes(attrName) ?? false}
    }

    attributes(className) {
        const node = this.THMO_CONCEPTS(className)
        const sc = this.g.each(node, this.RDFS('subClassOf'), null);
        const attr = {}

        sc.forEach(s => {
            if (this.hasType(s, this.OWL('Restriction'))) {
                const property = this.g.any(s, this.OWL('onProperty'), null);
                const range = this.g.any(property, this.RDFS('range'), null) || this.g.any(s, this.OWL('allValuesFrom'), null);
                const label = this.getLabel(property);
                if (property && 
                    this.hasRange(property, this.XSD('boolean')) &&
                    !(label in attr)) {
                    //console.log(label, this.getAttributeConfig(className, label))
                    const config_vals = this.getAttributeConfig(className, label);
                    attr[label] = {uri: property.uri, range: range.uri, ...config_vals}
                    //console.log(property.uri, this.g.any(property, this.RDFS('range')).uri, this.g.holds(property, this.RDFS('range'), this.XSD('boolean')), this.g.holds(property, this.OWL('allValuesFrom'), this.XSD('boolean')))
                }
            } 
        })

        return attr
    }

    isA(class_uri, super_uri) {
        const superClasses = this.g.each(class_uri, this.RDFS('subClassOf'), null);

        for (const sc of superClasses) {
            if (sc.equals(super_uri)) {
                return true;
            }
        }
        return false
    }

    variables(className) {
        //console.log("Collecting variables of ", className)
        const node = this.THMO_CONCEPTS(className)
        const sc = this.g.each(node, this.RDFS('subClassOf'), null);
        const vars = {}

        sc.forEach(s => {
            if (this.hasType(s, this.OWL('Restriction'))) {
                const property = this.g.any(s, this.OWL('onProperty'), null);
                const label = this.getLabel(property);
                const range = this.g.any(property, this.RDFS('range'), null) || this.g.any(s, this.OWL('allValuesFrom'), null);

                if (property && 
                    this.isA(range, this.THMO_CONCEPTS('Variable')) &&
                    !(label in vars)) 
                {
                    const name = this.getLabel(range);
                    const unit = this.g.any(range, this.SCHEMA('Unit'))?.toString();
                    
                    vars[label] = {uri: property.uri, 
                                   range: range.uri,
                                   name: name,
                                   value: NaN,
                                   unit: unit,
                                   active: false
                                }
                    //console.log(property.uri, unit?.toString(), range.uri, this.g.holds(property, this.RDFS('range')))
                }
            } 
        })

        return vars
    }

    getType (uri) {
        if (uri === this.XSD('boolean').uri) {
            return 'xsd:boolean'
        }

        const parents = this.getParents($rdf.sym(uri))
        const types = [this.THMO_CONCEPTS('Variable'), 
                       this.THMO_EQUATIONS('Equation'), 
                       this.THMO_CONCEPTS('Concept')]
        for (let i = 0; i < types.length; i++) {
            const concept = types[i].uri;
            if (parents.includes(concept)) {
                return concept
            }
        }
        return "missing"
    }

    propertyObject(prop, oldObject=undefined, minCard=undefined, maxCard=undefined) {
        const propObj = oldObject ?? {};
        propObj['rdfs:label'] ??= this.getLabel(prop);
        propObj['uri'] ??= prop.uri;
        const range = this.g.any(prop, this.RDFS('range'), null) ?? 
                          this.g.any(prop, this.OWL('allValuesFrom'), null) ?? 
                          this.XSD('string');
        propObj['range'] = range.uri;
        propObj.value = undefined;
        //propObj.parents ??= this.getParents($rdf.sym(propObj['rdfs:range']))
        propObj.type ??= this.getType(propObj['range'])
        if (propObj.type.includes('Variable')) {
            propObj.unit = this.g.any(range, this.SCHEMA('Unit'), null)?.value;
            propObj.mathExpression = this.g.any(range, this.SCHEMA('mathExpression'), null)?.value;
        }
        if (propObj.type.includes('Equation')) {
            propObj.applicable = undefined;
        }
        if (minCard?.value != null) {
            propObj['owl:minCardinality'] = parseInt(minCard.value);
        }
        if (maxCard?.value != null) {
            propObj['owl:maxCardinality'] = parseInt(maxCard.value);
        }
        return propObj
    }

    getProperties(className) {
        const node = this.THMO_CONCEPTS(className);
        const properties = {};

        const find = (node) => {
            const sc = this.g.each(node, this.RDFS('subClassOf'), null);
            sc.forEach((s) => {
                
                if (this.hasType(s, this.OWL('Restriction'))) {
                    const property = this.g.any(s, this.OWL('onProperty'), null);
                    const label = this.getLabel(property);
                    const minCard = this.g.any(s, this.OWL('minCardinality', null));
                    const maxCard = this.g.any(s, this.OWL('maxCardinality', null));
                    properties[label] = this.propertyObject(property, properties[label], minCard, maxCard);
                }
            })
        }
        find(node)
        this.getParents(className).forEach((parent) => {
            find($rdf.sym(parent))
        })
        return properties

        const concept = this.THMO_CONCEPTS('Concept');
        const thmo_namespace = this.THMO_CONCEPTS().uri;
        const sc = this.g.each(node, this.RDFS('subClassOf'), null);

        sc.forEach((s) => {
            if (s.termType === 'NamedNode') {
                console.log(s, "type")
                //console.log("concept", this.g.holds(s, this.RDF('type'), concept))
                //console.log("restriction", this.hasType(s, this.OWL('Restriction')))    
            }
        })

        return [];

                //console.log("is concept", this.g.holds(node, this.RDFS('subClassOf'), concept))
        //console.log("concept", concept.uri.startsWith(thmo_namespace))
        /*
        const children = this.g.each(null, this.RDFS('subClassOf'), concept);

        children.forEach((c) => {
            console.log(c)
        })
*/

    }

    getParents(className) {
        const node = className instanceof $rdf.Node ? className : this.THMO_CONCEPTS(className);
        const superClasses = new Set();

        const find = (node) => {
            const sc = this.g.each(node, this.RDFS('subClassOf'), null);
            sc.forEach((s) => {
                if (s.termType === 'NamedNode') {
                    superClasses.add(s.uri)
                    find(s)
                }
            })
        }
        find(node)
        return Array.from(superClasses)
    }

    isDefinedInNamespace(className, namespace) {
        return this.g.any(namespace(className), this.RDF('type'), null);
    }

    extractClassName(uri) {
        // Split the URI by # and /, and take the last segment
        const segments = uri.split(/[#/]/);
        return segments[segments.length - 1];
    }

    getAbbreviation(name, parents=undefined) {
        const className = this.extractClassName(name);
        let parentsValid = parents ?? this.getParents(className);
        const parentNames = parentsValid.map((parentUri) => this.extractClassName(parentUri));
        const firstNameWithAbbreviation = [className, ...parentNames].find(key => key in this.CONCEPT_ABBREVIATIONS);
        return firstNameWithAbbreviation ? this.CONCEPT_ABBREVIATIONS[firstNameWithAbbreviation] : className;
    }

    createConceptClass(className, id) {
        const classObj = {
            label: className,
            id: id,
            parents: this.getParents(className),
            properties: this.getProperties(className),
        }
        const abbreviation = this.getAbbreviation(className, classObj.parents);
        classObj.name = `${abbreviation}_${id}`;
        return classObj
    }

    getMathExpression(node) {
        return this.g.any(node, this.SCHEMA('mathExpression'), null)?.value ?? undefined;
    }

    getCodeExpression(node) {
        return this.g.any(node, this.THMO_EQUATIONS('codeExpression'), null)?.value ?? undefined;
    }

    createEquationClass(className, id) {
        const node = this.THMO_EQUATIONS(className);
        const obj = {
            className,
            id,
            name: `XXX_${id}`,
            mathExpression: this.getMathExpression(node),
            codeExpression: this.getCodeExpression(node),
            preconditions: "missing"
        }
        return obj;
    }

    createClass(className, id) {
        if (this.isDefinedInNamespace(className, this.THMO_EQUATIONS)) {
            return this.createEquationClass(className, id);
        }
        else if (this.isDefinedInNamespace(className, this.THMO_CONCEPTS)) {
            return this.createConceptClass(className, id);
        }
        console.log('unknown type')
        return {}
    }

    updateClass(obj, config) {
        Object.entries(config).forEach(([key,val]) => {
            if (key in obj.properties) {
                obj.properties[key].value = val;
            }
            else if (key === "fixed") {
                val.forEach((v) => {
                    if (v in obj.properties) {
                        obj.properties[v].fixed = true;
                    }
                })
            }
        })
    }

    findApplicableEquations(obj) {
        Object.entries(obj).forEach(([key,property]) => {
            if (property.type.contains('Equation')) {

            }
        })
    }
}

export default Ontology;