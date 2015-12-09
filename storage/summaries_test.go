package storage

import "testing"

func TestGetSummaries(t *testing.T) {
	summaries := getSummaries(`# Summary

* [Homepage](index.yml 'index.html')
* [No](menu, noslider, footer "no.html")
* [Slider](slider/index.yml "slider/index.html")
    * [Left](slider/left.yml "slider/left.html")
    * [Right](slider/right.yml)
        * [Left](slider/left.yml "slider/left.html")
        * [Right](slider/right.yml)
* [Slider](slider/index.yml "slider/index.html")
  `)

	if len(summaries) != 4 {
		t.Fatalf("Expected %v, got %v", len(summaries), 4)
	}

	if summaries[1].PageTemplateURL != "menu, noslider, footer" {
		t.Fatalf("Expected %v, got %v", summaries[1].PageTemplateURL, "menu, noslider, footer")
	}

	if summaries[1].PageURL != "no.html" {
		t.Fatalf("Expected %v, got %v", summaries[1].PageURL, "no.html")
	}

	if len(summaries[2].Children) != 2 {
		t.Fatalf("Expected %v, got %v", len(summaries[2].Children), 2)
	}
}
