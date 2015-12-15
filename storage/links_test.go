package storage

import "testing"

func TestGetLinks(t *testing.T) {
	links := getLinks(`# Links

* [Homepage](index.yml 'index.html')
* [No](menu, noslider, footer "no.html")
* [Slider](slider/index.yml "slider/index.html")
    * [Left](slider/left.yml "slider/left.html")
    * [Right](slider/right.yml)
        * [Left](slider/left.yml "slider/left.html")
        * [Right](slider/right.yml)
* [Slider](slider/index.yml "slider/index.html")
  `)

	if len(links) != 4 {
		t.Fatalf("Expected %v, got %v", len(links), 4)
	}

	if links[1].Path != "menu, noslider, footer" {
		t.Fatalf("Expected %v, got %v", links[1].Path, "menu, noslider, footer")
	}

	if links[1].URL != "no.html" {
		t.Fatalf("Expected %v, got %v", links[1].URL, "no.html")
	}

	if len(links[2].Children) != 2 {
		t.Fatalf("Expected %v, got %v", len(links[2].Children), 2)
	}
}
