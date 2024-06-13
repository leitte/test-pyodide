import * as $rdf from 'rdflib';
import config_thmo from '$lib/config_thmo.json'

class Ontology {
    constructor(ontologyTTL, url) {
        this.g = $rdf.graph();
        const mimeType = 'text/turtle'
        try {
            $rdf.parse(ontologyTTL, this.g, url, mimeType)
            Object.entries(this.g.namespaces).forEach(([key,value]) => {
                this[key.toUpperCase()] = $rdf.Namespace(value);
            });

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

    getLabel(uri) {
        const label = this.g.any(uri, this.RDFS('label'), null);
        if (label) {
            return label.toString();
        }
        // TODO: handle error case
        return "";
    }

    getAttributeConfig(className, attrName) {
        return {value: config_thmo[className]?.[attrName],
                fixed: config_thmo[className]?.fixed?.includes(attrName)}
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
        console.log(node.uri, this.getLabel(node))
        console.log(attr)

        /*
        const subclasses = this.g.each($rdf.sym(this.THMO_CONCEPTS('Transition')), this.RDFS('subClassOf'), null);
        subclasses.forEach(s => {
            const restrictions = this.g.each(s, this.RDF('type'), this.OWL('Restriction'));
            restrictions.forEach(r => {
                console.log(r)
            })
        })
        console.log(subclasses.length)
        subclasses.slice(0,3).forEach(s =>{
            console.log(s)
        })
            */

/*
        const subclasses = this.g.each(this.THMO_CONCEPTS(className), this.RDFS('subClassOf'), null);
        subclasses.forEach(subclass => {
            if (this.g.holds(subclass, this.RDF('type'), this.OWL('Restriction'))) {
                
            }
        });

        const rdf = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
        const rdfs = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
        const owl = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
        const xsd = $rdf.Namespace('http://www.w3.org/2001/XMLSchema#');
      
        const objects = this.g.each(undefined, rdfs('subClassOf'), undefined);
        const properties = [];
        
        objects.forEach(object => {
          const restrictions = this.g.each(object, rdf('type'), owl('Restriction'));
          restrictions.forEach(restriction => {
            const onProperty = this.g.any(restriction, owl('onProperty'));
            const range = this.g.any(onProperty, rdfs('range'));
            if (range && range.uri === xsd('boolean').uri) {
              properties.push(onProperty);
            }
          });
        });
      
        console.log(properties);
        */
    }

    
}

export default Ontology;