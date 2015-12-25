package apps

import (
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/labstack/echo"
)

// List return apps
func List(c *echo.Context) error {
	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	apps, err := dao.NewAppDAO().GetApps(api.Owner(c))
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, apps)
}
