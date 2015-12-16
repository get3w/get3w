package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

var localParser, _ = NewLocalParser("../local")

func TestLoadSiteLinksByString(t *testing.T) {
	localParser.loadSiteLinksByString([]byte(`# Links

* [Homepage](index.yml 'index.html')
* [No](menu, noslider, footer "no.html")
* [Slider](slider/index.yml "slider/index.html")
    * [Left](slider/left.yml "slider/left.html")
    * [Right](slider/right.yml)
        * [Left](slider/left.yml "slider/left.html")
        * [Right](slider/right.yml)
* [Slider](slider/index.yml "slider/index.html")
  `))

	assert.Equal(t, 4, len(localParser.Current.Links))
	assert.Equal(t, "menu, noslider, footer", localParser.Current.Links[1].Path)
	assert.Equal(t, "no.html", localParser.Current.Links[1].URL)
	assert.Equal(t, 2, len(localParser.Current.Links[2].Children))
}
